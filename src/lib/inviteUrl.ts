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

export function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
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
  try {
    const res = await fetch("/api/invite-origin", { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return (await res.json()) as InviteOrigin;
  } catch {
    return null;
  }
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
