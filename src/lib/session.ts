import type { SessionLang } from "../types";
import { apiFetch, getApi, postApi, postApiJson } from "./net";

export const SESSION_LANGS: SessionLang[] = ["pt", "pt-BR", "pt-PT", "pt-AO", "tr", "en", "fr"];

export const SESSION_LANG_NAME: Record<SessionLang, string> = {
  pt: "Português (Moçambique)",
  "pt-BR": "Português (Brasil)",
  "pt-PT": "Português (Portugal)",
  "pt-AO": "Português (Angola)",
  tr: "Türkçe",
  en: "English",
  fr: "Français",
};

export const SESSION_LANG_FLAG: Record<SessionLang, string> = {
  pt: "🇲🇿",
  "pt-BR": "🇧🇷",
  "pt-PT": "🇵🇹",
  "pt-AO": "🇦🇴",
  tr: "🇹🇷",
  en: "🇬🇧",
  fr: "🇫🇷",
};

export type SessionCreds = {
  code: string;
  token: string;
  role: "a" | "b";
  myLang: SessionLang;
  peerLang: SessionLang | null;
};

const CREDS_KEY = "ank-mz-session";

export function saveCreds(c: SessionCreds): void {
  sessionStorage.setItem(CREDS_KEY, JSON.stringify(c));
}

export function loadCreds(code: string): SessionCreds | null {
  try {
    const c = JSON.parse(sessionStorage.getItem(CREDS_KEY) ?? "null") as SessionCreds | null;
    return c && c.code === code ? c : null;
  } catch {
    return null;
  }
}

export function clearCreds(): void {
  sessionStorage.removeItem(CREDS_KEY);
}

export async function createSession(lang: SessionLang): Promise<{ code: string; token: string; publicUrl?: string }> {
  try {
    const data = await postApiJson<{ code?: string; token?: string; publicUrl?: string }>("/api/session", { lang });
    if (data.code && data.token) return { code: data.code, token: data.token, publicUrl: data.publicUrl };
  } catch {
    /* alguns túneis bloqueiam POST — tenta GET */
  }
  const res = await getApi(`/api/session/new?lang=${encodeURIComponent(lang)}`);
  if (!res.ok) throw new Error(`create: HTTP ${res.status}`);
  const data = (await res.json()) as { code?: string; token?: string; publicUrl?: string };
  if (!data.code || !data.token) throw new Error("create: bad payload");
  return { code: data.code, token: data.token, publicUrl: data.publicUrl };
}

export async function getSession(code: string): Promise<{ creatorLang: SessionLang; status: string } | null> {
  const res = await apiFetch(`/api/session/${encodeURIComponent(code)}`, { retries: 1 });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`get: HTTP ${res.status}`);
  return (await res.json()) as { creatorLang: SessionLang; status: string };
}

export async function joinSession(
  code: string,
  lang: SessionLang,
): Promise<{ token: string; creatorLang: SessionLang } | "full" | "gone"> {
  const res = await postApi(`/api/session/${encodeURIComponent(code)}/join`, { lang });
  if (res.status === 409) return "full";
  if (res.status === 404) return "gone";
  if (!res.ok) throw new Error(`join: HTTP ${res.status}`);
  return (await res.json()) as { token: string; creatorLang: SessionLang };
}

export type WsMsg =
  | { type: "hello"; role: "a" | "b"; status: string; peerLang: SessionLang | null; peerOnline: boolean }
  | { type: "joined"; lang: SessionLang }
  | { type: "peer"; online: boolean }
  | { type: "speaking"; active: boolean }
  | { type: "interim"; text: string }
  | { type: "utterance"; original: string; translated: string }
  | { type: "end" }
  | { type: "error"; error: string }
  | { type: "ping" }
  | { type: "pong" };

export type SessionConnection = {
  send: (msg: WsMsg) => void;
  close: () => void;
};

/** WebSocket with automatic reconnection, heartbeat (túneis HTTPS) and online-event retry. */
export function connectSession(opts: {
  code: string;
  token: string;
  onMessage: (msg: WsMsg) => void;
  onConnected: () => void;
  onDisconnected: () => void;
}): SessionConnection {
  let ws: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let beat: ReturnType<typeof setInterval> | undefined;

  function stopBeat() {
    clearInterval(beat);
    beat = undefined;
  }

  function startBeat() {
    stopBeat();
    beat = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
    }, 20_000);
  }

  function open() {
    if (closed) return;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(
      `${proto}//${location.host}/ws?code=${encodeURIComponent(opts.code)}&token=${encodeURIComponent(opts.token)}`,
    );
    ws.onopen = () => {
      attempt = 0;
      startBeat();
      opts.onConnected();
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as WsMsg;
        if (msg.type === "pong" || msg.type === "ping") return;
        if (msg.type === "end" || (msg.type === "error" && msg.error === "invalid session")) closed = true;
        opts.onMessage(msg);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      ws = null;
      stopBeat();
      opts.onDisconnected();
      if (!closed) {
        attempt += 1;
        timer = setTimeout(open, Math.min(15_000, 400 * 2 ** attempt));
      }
    };
  }

  function onOnline() {
    if (closed || (ws && ws.readyState === WebSocket.OPEN)) return;
    clearTimeout(timer);
    attempt = 0;
    open();
  }

  open();
  window.addEventListener("online", onOnline);

  return {
    send: (msg) => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
    close: () => {
      closed = true;
      clearTimeout(timer);
      stopBeat();
      window.removeEventListener("online", onOnline);
      ws?.close();
    },
  };
}
