/** Site HTTPS estável (Vercel). O QR do telemóvel NUNCA usa localhost nem túnel morto. */
export const PUBLIC_SITE = String(
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_PUBLIC_SITE) ||
    "https://ankara-mz-translate.vercel.app",
).replace(/\/$/, "");

export function publicInviteUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${PUBLIC_SITE}${p}`;
}

/** Link the phone camera can actually open. Never encode localhost.
 * Use a path (not ?query) — many phone cameras drop the query string. */

export type InviteOrigin = {
  origin: string;
  public?: string;
  lan?: string;
  https?: boolean;
  loopback?: boolean;
  phoneReady?: boolean;
  phoneReadyAnywhere?: boolean;
};

export async function phoneJoinUrl(code: string): Promise<string> {
  return phoneUrl(`/join/${encodeURIComponent(code.toUpperCase())}`);
}

/** Same, for multi-participant rooms: /join-room/CODE. */
export async function phoneRoomUrl(roomId: string): Promise<string> {
  return phoneUrl(`/join-room/${encodeURIComponent(roomId.toUpperCase())}`);
}

/** Landing / PIN invite for phones (HTTPS public origin when available). */
export async function phoneGateUrl(pin: string): Promise<string> {
  return phoneUrl(`/gate?pin=${encodeURIComponent(pin)}`);
}

export async function phoneUrl(pathAndQuery: string): Promise<string> {
  const origin = await phoneOrigin();
  return `${origin}${pathAndQuery}`;
}

/** QR: sempre o site HTTPS da Vercel — a câmara do telemóvel abre isto. */
export function liveInviteUrl(_serverPublicUrl: string | undefined, path: string): string {
  const here = window.location.origin;
  if (/\.vercel\.app$/i.test(window.location.hostname) && window.location.protocol === "https:") {
    return `${here}${path}`;
  }
  return publicInviteUrl(path);
}

export function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

export function isTunnelHost(host: string): boolean {
  return /(?:^|\.)(loca\.lt|trycloudflare\.com|ngrok(?:-free)?\.(?:app|io|dev)|pinggy\.link)$/i.test(host);
}

export function isPhoneBrowser(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/** PC deve criar o QR em localhost — o túnel HTTPS é só para o telemóvel. */
export function pcAppUrl(path: string): string {
  const next = path.startsWith("/") ? path : `/${path}`;
  return `http://127.0.0.1:8787${next}`;
}

export function isLoopbackUrl(raw: string): boolean {
  try {
    return isLoopbackHost(new URL(raw).hostname);
  } catch {
    return true;
  }
}

function pickOrigin(candidates: Array<string | undefined>): string | null {
  const urls: string[] = [];
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const u = new URL(raw);
      if (isLoopbackHost(u.hostname)) continue;
      urls.push(u.origin);
    } catch {
      /* skip */
    }
  }
  return urls.find((u) => u.startsWith("https:")) ?? urls[0] ?? null;
}

export async function fetchInviteOrigin(): Promise<InviteOrigin | null> {
  const bases = [""];
  if (typeof window !== "undefined" && window.location.protocol !== "https:") {
    if (window.location.hostname !== "127.0.0.1") bases.push("http://127.0.0.1:8787");
    if (window.location.hostname !== "localhost") bases.push("http://localhost:8787");
  }
  for (const base of [...new Set(bases)]) {
    try {
      const res = await fetch(`${base}/api/invite-origin`, {
        cache: "no-store",
        headers: { "bypass-tunnel-reminder": "1" },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const ctype = res.headers.get("content-type") || "";
      if (!/json/i.test(ctype)) continue;
      return (await res.json()) as InviteOrigin;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function phoneOrigin(): Promise<string> {
  const here = window.location.origin;
  if (!isLoopbackHost(window.location.hostname) && window.location.protocol === "https:") return here;
  const data = await fetchInviteOrigin();
  if (data) {
    const picked = pickOrigin([data.public, data.origin, data.lan, here]);
    if (picked) return picked;
  }
  return pickOrigin([here]) ?? here;
}

export function joinCodeFromLocation(): string | null {
  const q = new URLSearchParams(window.location.search).get("join");
  if (q) return q.trim().toUpperCase();
  const hash = window.location.hash.replace(/^#\/?/, "");
  const m = hash.match(/^join\/([A-Z0-9]{4,8})$/i);
  return m ? m[1].toUpperCase() : null;
}

export function roomCodeFromLocation(): string | null {
  const q = new URLSearchParams(window.location.search).get("room");
  return q ? q.trim().toUpperCase() : null;
}
