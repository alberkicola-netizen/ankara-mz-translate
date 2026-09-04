import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import { apiFetch, postApi, postApiJson } from "./net";
import type { SessionLang } from "../types";

/** Mensagem no formato único usado pelo histórico e pelos broadcasts. */
export type RoomMessage = {
  utteranceId: string;
  clientKey: string;
  fromId: string;
  fromName: string;
  sourceLanguage: SessionLang;
  sourceText: string;
  targetLanguage: SessionLang;
  translatedText: string | null;
  failed: boolean;
  pending: boolean;
  at: string;
  mine?: boolean;
};

export type TranslatedPatch = {
  utteranceId: string;
  clientKey: string;
  fromId?: string;
  targetLanguage: SessionLang;
  translatedText: string | null;
  failed: boolean;
};

export type RoomPresence = {
  participantId: string;
  displayName: string;
  sourceLanguage: SessionLang;
  targetLanguage: SessionLang;
};

export type RoomInfo = {
  roomId: string;
  participantCount: number;
  maxParticipants: number;
  languages: SessionLang[];
};

export type RoomCreds = {
  roomId: string;
  participantId: string;
  displayName: string;
  sourceLanguage: SessionLang;
  targetLanguage: SessionLang;
  isHost: boolean;
};

const CREDS_KEY = "ank-mz-room";

export function saveRoomCreds(c: RoomCreds): void {
  sessionStorage.setItem(CREDS_KEY, JSON.stringify(c));
}

export function loadRoomCreds(roomId: string): RoomCreds | null {
  try {
    const c = JSON.parse(sessionStorage.getItem(CREDS_KEY) ?? "null") as RoomCreds | null;
    return c && c.roomId === roomId.toUpperCase() ? c : null;
  } catch {
    return null;
  }
}

export function clearRoomCreds(): void {
  sessionStorage.removeItem(CREDS_KEY);
}

export type RoomsMeta = { enabled: boolean; stt: boolean; tts?: boolean; realTranslate: boolean; model?: string | null };

export async function fetchRoomsMeta(): Promise<RoomsMeta> {
  try {
    const res = await apiFetch("/api/rooms-meta", { retries: 1, timeoutMs: 8_000 });
    if (!res.ok) return { enabled: false, stt: false, realTranslate: false };
    return (await res.json()) as RoomsMeta;
  } catch {
    return { enabled: false, stt: false, realTranslate: false };
  }
}

type NewParticipant = { displayName: string; sourceLanguage: SessionLang; targetLanguage: SessionLang };

export async function createRoom(
  p: NewParticipant,
): Promise<{ roomId: string; participantId: string; publicUrl: string }> {
  try {
    const data = await postApiJson<{ roomId?: string; participantId?: string; publicUrl?: string }>("/api/rooms", p);
    if (!data.roomId || !data.participantId) throw new Error("create room: bad payload");
    return { roomId: data.roomId, participantId: data.participantId, publicUrl: data.publicUrl || "" };
  } catch (err) {
    if (err instanceof Error && /HTTP 503/.test(err.message)) throw new Error("not-configured");
    throw err;
  }
}

export async function getRoomInfo(roomId: string): Promise<RoomInfo | "gone"> {
  const res = await apiFetch(`/api/rooms/${encodeURIComponent(roomId)}`, { retries: 1 });
  if (res.status === 404 || res.status === 410 || res.status === 503) return "gone";
  if (!res.ok) throw new Error(`room info: HTTP ${res.status}`);
  return (await res.json()) as RoomInfo;
}

export async function joinRoom(
  roomId: string,
  p: NewParticipant,
): Promise<{ participantId: string } | "full" | "gone"> {
  const res = await postApi(`/api/rooms/${encodeURIComponent(roomId)}/join`, p);
  if (res.status === 409) return "full";
  if (res.status === 404 || res.status === 410 || res.status === 503) return "gone";
  if (!res.ok) throw new Error(`join room: HTTP ${res.status}`);
  return (await res.json()) as { participantId: string };
}

export async function fetchRoomMessages(roomId: string, participantId: string): Promise<RoomMessage[]> {
  try {
    const res = await apiFetch(
      `/api/rooms/${encodeURIComponent(roomId)}/utterances?participantId=${encodeURIComponent(participantId)}`,
      { retries: 1 },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { messages: RoomMessage[] };
    return data.messages ?? [];
  } catch {
    return [];
  }
}

export async function sendRoomText(
  roomId: string,
  participantId: string,
  text: string,
): Promise<{ clientKey: string }> {
  const res = await apiFetch(`/api/rooms/${encodeURIComponent(roomId)}/utterance`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ participantId, text }),
  });
  if (!res.ok) throw new Error(`utterance: HTTP ${res.status}`);
  return (await res.json()) as { clientKey: string };
}

/** Push-to-talk: envia o áudio gravado; o backend transcreve (Whisper) e distribui. */
export async function sendRoomSpeech(
  roomId: string,
  participantId: string,
  audio: Blob,
): Promise<{ text: string }> {
  const form = new FormData();
  form.append("participantId", participantId);
  form.append("audio", audio, "speech.webm");
  const res = await apiFetch(`/api/rooms/${encodeURIComponent(roomId)}/speak`, {
    method: "POST",
    body: form,
    timeoutMs: 90_000,
    retries: 1,
  });
  if (res.status === 503) throw new Error("stt-off");
  if (res.status === 422) throw new Error("nothing-recognized");
  if (!res.ok) throw new Error(`speak: HTTP ${res.status}`);
  return (await res.json()) as { text: string };
}

export async function closeRoom(roomId: string, participantId: string): Promise<void> {
  await apiFetch(`/api/rooms/${encodeURIComponent(roomId)}/close`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ participantId }),
  });
}

export type RoomConnection = { close: () => void };

/**
 * Canal Realtime `room:{id}`: broadcasts do backend + presence dos participantes.
 * O supabase-js trata da reconexão automática do socket; as credenciais ficam
 * em sessionStorage para sobreviver a reloads.
 */
export function connectRoom(opts: {
  roomId: string;
  me: RoomPresence;
  onMessage: (m: RoomMessage) => void;
  onTranslated: (p: TranslatedPatch) => void;
  onClosed: () => void;
  onPresence: (list: RoomPresence[]) => void;
  onStatus: (connected: boolean) => void;
}): RoomConnection | null {
  if (!supabase) return null;

  const channel: RealtimeChannel = supabase.channel(`room:${opts.roomId}`, {
    config: { presence: { key: opts.me.participantId } },
  });

  channel
    .on("broadcast", { event: "new_utterance" }, ({ payload }) => {
      opts.onMessage(payload as RoomMessage);
    })
    .on("broadcast", { event: "utterance_translated" }, ({ payload }) => {
      opts.onTranslated(payload as TranslatedPatch);
    })
    .on("broadcast", { event: "room_closed" }, () => opts.onClosed())
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<RoomPresence>();
      const list: RoomPresence[] = [];
      for (const metas of Object.values(state)) {
        if (metas[0]) list.push(metas[0]);
      }
      opts.onPresence(list);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        opts.onStatus(true);
        void channel.track(opts.me);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        opts.onStatus(false);
      }
    });

  function onOnline() {
    opts.onStatus(false);
    void channel.track(opts.me).then(() => opts.onStatus(true)).catch(() => undefined);
  }
  window.addEventListener("online", onOnline);

  return {
    close: () => {
      window.removeEventListener("online", onOnline);
      void supabase?.removeChannel(channel);
    },
  };
}
