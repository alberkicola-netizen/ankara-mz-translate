import type { SessionLang } from "../types";
import { PUBLIC_SITE } from "./inviteUrl";
import { apiFetch, getApi, postApi } from "./net";
import { supabase } from "./supabaseClient";
import { cloudCreate, cloudGet, cloudJoin, cloudSessionsEnabled } from "./pairCloud";

const CODE_ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function isSessionCode(code: string): boolean {
  return /^[A-HJ-NP-Z2-9]{6}$/.test(code.trim().toUpperCase());
}

function localCode(): string {
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  let code = "";
  for (const n of buf) code += CODE_ALPH[n % CODE_ALPH.length];
  return code;
}

function localToken(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function joinLink(code: string, lang?: SessionLang): string {
  const q = lang ? `?lang=${encodeURIComponent(lang)}` : "";
  return `${PUBLIC_SITE}/join/${code}${q}`;
}

export const SESSION_LANGS: SessionLang[] = ["pt", "tr", "en"];

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
    const res = await apiFetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lang }),
      timeoutMs: 4_000,
      retries: 0,
    });
    const ctype = res.headers.get("content-type") || "";
    if (res.ok && /json/i.test(ctype)) {
      const data = (await res.json()) as { code?: string; token?: string; publicUrl?: string };
      if (data.code && data.token) return { code: data.code, token: data.token, publicUrl: data.publicUrl };
    }
  } catch {
    /* nuvem / GET */
  }
  if (cloudSessionsEnabled()) {
    try {
      const cloud = await cloudCreate(lang);
      if (cloud) return cloud;
    } catch {
      /* GET local */
    }
  }
  const onVercel = typeof location !== "undefined" && /\.vercel\.app$/i.test(location.hostname);
  if (!onVercel) {
    try {
      const res = await getApi(`/api/session/new?lang=${encodeURIComponent(lang)}`);
      if (res.ok) {
        const data = (await res.json()) as { code?: string; token?: string; publicUrl?: string };
        if (data.code && data.token) return { code: data.code, token: data.token, publicUrl: data.publicUrl };
      }
    } catch {
      /* Realtime local */
    }
  }
  const code = localCode();
  const token = localToken();
  return { code, token, publicUrl: joinLink(code, lang) };
}

export async function getSession(code: string): Promise<{ creatorLang: SessionLang; status: string } | null> {
  const id = code.trim().toUpperCase();
  let lookupErr: Error | null = null;
  try {
    const res = await apiFetch(`/api/session/${encodeURIComponent(id)}`, { retries: 1, timeoutMs: 10_000 });
    const ctype = res.headers.get("content-type") || "";
    if (res.ok && /json/i.test(ctype)) {
      return (await res.json()) as { creatorLang: SessionLang; status: string };
    }
    if (res.status !== 404) lookupErr = new Error(`get: HTTP ${res.status}`);
  } catch (err) {
    lookupErr = err instanceof Error ? err : new Error("network");
  }
  if (cloudSessionsEnabled()) {
    try {
      const cloud = await cloudGet(id);
      if (cloud) return cloud;
    } catch {
      /* not found */
    }
  }
  if (lookupErr) throw lookupErr;
  return null;
}

export async function joinSession(
  code: string,
  lang: SessionLang,
): Promise<{ token: string; creatorLang: SessionLang } | "full" | "gone"> {
  try {
    const res = await postApi(`/api/session/${encodeURIComponent(code)}/join`, { lang });
    if (res.status === 409) return "full";
    if (res.status === 404) {
      /* nuvem */
    } else {
      if (!res.ok) throw new Error(`join: HTTP ${res.status}`);
      return (await res.json()) as { token: string; creatorLang: SessionLang };
    }
  } catch {
    /* nuvem / Realtime */
  }
  if (cloudSessionsEnabled()) {
    const cloud = await cloudJoin(code, lang).catch(() => null);
    if (cloud === "full") return cloud;
    if (cloud && cloud !== "gone") return cloud;
  }
  if (isSessionCode(code)) return { token: localToken(), creatorLang: lang };
  return "gone";
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

type ConnectOpts = {
  code: string;
  token: string;
  role?: "a" | "b";
  lang?: SessionLang;
  onMessage: (msg: WsMsg) => void;
  onConnected: () => void;
  onDisconnected: () => void;
};

type PresenceMeta = { token: string; role?: "a" | "b"; lang?: SessionLang };

type LiveHub = {
  send: (msg: WsMsg) => void;
  destroy: () => void;
  attach: (opts: ConnectOpts) => void;
  connected: boolean;
  refs: number;
};

const liveHubs = new Map<string, LiveHub>();
const destroyTimers = new Map<string, ReturnType<typeof setTimeout>>();

function hubKey(code: string, token: string): string {
  return `${String(code).toUpperCase()}:${token}`;
}

function retain(hub: LiveHub, key: string): void {
  hub.refs += 1;
  const t = destroyTimers.get(key);
  if (t) {
    clearTimeout(t);
    destroyTimers.delete(key);
  }
}

function release(hub: LiveHub, key: string): void {
  hub.refs -= 1;
  if (hub.refs > 0) return;
  const prev = destroyTimers.get(key);
  if (prev) clearTimeout(prev);
  destroyTimers.set(
    key,
    setTimeout(() => {
      destroyTimers.delete(key);
      if (hub.refs > 0) return;
      hub.destroy();
      liveHubs.delete(key);
    }, 80),
  );
}

/** Realtime na Vercel/telemóvel; WebSocket só no servidor local. */
export function connectSession(opts: ConnectOpts): SessionConnection {
  const key = hubKey(opts.code, opts.token);
  const existing = liveHubs.get(key);
  if (existing) {
    retain(existing, key);
    existing.attach(opts);
    return {
      send: existing.send,
      close: () => release(existing, key),
    };
  }
  const hub = supabase ? connectSessionRealtime(opts) : connectSessionWs(opts);
  hub.refs = 0;
  liveHubs.set(key, hub);
  retain(hub, key);
  return {
    send: hub.send,
    close: () => release(hub, key),
  };
}

function connectSessionRealtime(opts: ConnectOpts): LiveHub {
  let closed = false;
  let connected = false;
  let peerSeen = false;
  let listeners: ConnectOpts = opts;
  let announceTimer: ReturnType<typeof setInterval> | undefined;
  const topic = `session:${opts.code.toUpperCase()}`;
  const ch = supabase!.channel(topic, {
    config: {
      private: false,
      broadcast: { ack: true, self: false },
      presence: { key: opts.token },
    },
  });

  function emit(msg: WsMsg) {
    if (closed) return;
    listeners.onMessage(msg);
  }

  function meta(): PresenceMeta {
    return { token: listeners.token, role: listeners.role, lang: listeners.lang };
  }

  function announce() {
    if (closed || peerSeen || !listeners.lang) return;
    void ch.send({
      type: "broadcast",
      event: "sig",
      payload: { type: "joined", lang: listeners.lang, token: listeners.token } satisfies WsMsg & { token: string },
    });
  }

  function readPresence() {
    if (closed) return;
    const state = ch.presenceState<PresenceMeta>();
    const others: PresenceMeta[] = [];
    for (const [key, metas] of Object.entries(state)) {
      const row = metas[0];
      if (!row) continue;
      if (key === listeners.token || row.token === listeners.token) continue;
      others.push(row);
    }
    if (!others.length) {
      if (peerSeen) {
        peerSeen = false;
        emit({ type: "peer", online: false });
      }
      return;
    }
    peerSeen = true;
    if (announceTimer) {
      clearInterval(announceTimer);
      announceTimer = undefined;
    }
    const other = others[0];
    if (other.lang) emit({ type: "joined", lang: other.lang });
    emit({ type: "peer", online: true });
  }

  ch.on("broadcast", { event: "sig" }, ({ payload }) => {
    const msg = payload as WsMsg & { token?: string };
    if (!msg || msg.token === listeners.token) return;
    const { token: _t, ...rest } = msg as WsMsg & { token?: string };
    if (rest.type === "pong" || rest.type === "ping") return;
    if (rest.type === "joined" || (rest.type === "peer" && rest.online)) {
      peerSeen = true;
      clearInterval(announceTimer);
      announceTimer = undefined;
    }
    emit(rest);
  });
  ch.on("presence", { event: "sync" }, readPresence);
  ch.on("presence", { event: "join" }, readPresence);
  ch.on("presence", { event: "leave" }, readPresence);

  ch.subscribe((status) => {
    if (closed) return;
    if (status === "SUBSCRIBED") {
      connected = true;
      void ch.track(meta());
      listeners.onConnected();
      announce();
      if (!announceTimer) announceTimer = setInterval(announce, 1000);
    }
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      connected = false;
      listeners.onDisconnected();
    }
  });

  const hub: LiveHub = {
    refs: 0,
    get connected() {
      return connected;
    },
    send: (msg) => {
      if (closed) return;
      void ch.send({ type: "broadcast", event: "sig", payload: { ...msg, token: listeners.token } });
    },
    attach: (next) => {
      listeners = next;
      if (connected) {
        void ch.track(meta());
        next.onConnected();
        announce();
        readPresence();
      }
    },
    destroy: () => {
      closed = true;
      connected = false;
      clearInterval(announceTimer);
      announceTimer = undefined;
      void supabase!.removeChannel(ch);
    },
  };
  return hub;
}

function connectSessionWs(opts: ConnectOpts): LiveHub {
  let ws: WebSocket | null = null;
  let closed = false;
  let connected = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let beat: ReturnType<typeof setInterval> | undefined;
  let listeners: ConnectOpts = opts;

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
      connected = true;
      startBeat();
      listeners.onConnected();
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as WsMsg;
        if (msg.type === "pong" || msg.type === "ping") return;
        if (msg.type === "end" || (msg.type === "error" && msg.error === "invalid session")) closed = true;
        listeners.onMessage(msg);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      ws = null;
      connected = false;
      stopBeat();
      listeners.onDisconnected();
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
    refs: 0,
    get connected() {
      return connected;
    },
    send: (msg) => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
    attach: (next) => {
      listeners = next;
      if (connected) next.onConnected();
    },
    destroy: () => {
      closed = true;
      connected = false;
      clearTimeout(timer);
      stopBeat();
      window.removeEventListener("online", onOnline);
      ws?.close();
    },
  };
}
