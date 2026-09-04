import { useEffect, useState } from "react";

/** Rede instável (telemóvel / túnel): timeout + retries, sem depender de navigator.onLine. */

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type ApiFetchInit = RequestInit & {
  timeoutMs?: number;
  retries?: number;
};

function withTunnelHeaders(init: RequestInit): Headers {
  const headers = new Headers(init.headers);
  headers.set("bypass-tunnel-reminder", "1");
  return headers;
}

export async function apiFetch(input: RequestInfo | URL, init: ApiFetchInit = {}): Promise<Response> {
  const { timeoutMs = 20_000, retries = 2, ...rest } = init;
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const parent = rest.signal;
    const onAbort = () => ctrl.abort();
    parent?.addEventListener("abort", onAbort);
    try {
      const res = await fetch(input, { ...rest, headers: withTunnelHeaders(rest), signal: ctrl.signal });
      clearTimeout(timer);
      parent?.removeEventListener("abort", onAbort);
      const ctype = res.headers.get("content-type") || "";
      if (res.ok && /text\/html/i.test(ctype) && i < retries) {
        await sleep(400 * 2 ** i);
        continue;
      }
      if ((res.status >= 500 || res.status === 429) && i < retries) {
        await sleep(400 * 2 ** i);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onAbort);
      lastErr = err;
      if (i < retries) await sleep(400 * 2 ** i);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("network");
}

function apiBases(): string[] {
  const bases = [""];
  if (typeof window === "undefined") return bases;
  // HTTPS (loca.lt) cannot call http://127.0.0.1 — the browser blocks mixed content.
  if (window.location.protocol === "https:") return bases;
  const host = window.location.hostname;
  if (host !== "127.0.0.1") bases.push("http://127.0.0.1:8787");
  if (host !== "localhost") bases.push("http://localhost:8787");
  return [...new Set(bases)];
}

/** POST: tenta o site actual e, em HTTP no PC, o servidor local. */
export async function postApi(path: string, body: unknown): Promise<Response> {
  let last: unknown;
  for (const base of apiBases()) {
    try {
      const res = await apiFetch(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        timeoutMs: 8_000,
        retries: 1,
      });
      const ctype = res.headers.get("content-type") || "";
      if (/html/i.test(ctype)) {
        last = new Error("not-json");
        continue;
      }
      return res;
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("network");
}

export async function postApiJson<T>(path: string, body: unknown): Promise<T> {
  const res = await postApi(path, body);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("not-json");
  }
}

export function classifyNetworkError(err: unknown, ui: { offlineErr: string; generateFailed: string; connServerDown: string }): string {
  if (err instanceof Error && err.message === "not-configured") return err.message;
  const msg = err instanceof Error ? err.message : "";
  if (
    msg === "network" ||
    /failed to fetch|networkerror|abort|timeout|load failed/i.test(msg) ||
    (err instanceof DOMException && err.name === "AbortError")
  ) {
    return ui.connServerDown;
  }
  if (/HTTP 503/.test(msg)) return ui.connServerDown;
  return ui.generateFailed;
}

/** navigator.onLine só para o indicador visual — não bloqueia pedidos. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

/** Ping real ao backend (o túnel Cloudflare pode morrer com o browser ainda "online"). */
export function useServerReachable(): boolean {
  const [up, setUp] = useState(true);
  useEffect(() => {
    let stop = false;
    async function ping() {
      try {
        const res = await fetch("/api/rooms-meta", { cache: "no-store", signal: AbortSignal.timeout(8000) });
        if (!stop) setUp(res.ok);
      } catch {
        if (!stop) setUp(false);
      }
    }
    void ping();
    const id = setInterval(() => void ping(), 12_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);
  return up;
}
