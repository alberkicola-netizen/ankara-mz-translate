import type { SessionLang } from "../types";
import { PHRASES } from "../data/phrases";
import { normalize } from "./speech";
import { apiFetch } from "./net";

const MT_LANG: Record<SessionLang, string> = {
  pt: "pt-PT",
  "pt-BR": "pt-BR",
  "pt-PT": "pt-PT",
  "pt-AO": "pt-PT",
  tr: "tr-TR",
  en: "en-GB",
  fr: "fr-FR",
};

export type Translation = {
  text: string;
  /** Match confidence 0..1 — used for the quality indicator. */
  match: number;
};

const clientCache = new Map<string, Translation>();
const CLIENT_CACHE_MAX = 80;

function packLang(lang: SessionLang): "pt" | "tr" | "en" | null {
  if (lang === "tr") return "tr";
  if (lang === "en") return "en";
  if (lang.startsWith("pt")) return "pt";
  return null;
}

/** Cartões aprovados — funciona sem internet e sem o servidor. */
export function cardTranslate(text: string, from: SessionLang, to: SessionLang): Translation | null {
  const a = packLang(from);
  const b = packLang(to);
  if (!a || !b || a === b) return null;
  const q = normalize(text);
  if (q.length < 2) return null;
  let fuzzy: Translation | null = null;
  let fuzzyScore = 0;
  for (const p of PHRASES) {
    const src = normalize(p[a]);
    const dest = p[b].trim();
    if (!src || !dest) continue;
    if (src === q) return { text: dest, match: 1 };
    if (src.includes(q) || q.includes(src)) {
      const score = Math.min(src.length, q.length) / Math.max(src.length, q.length);
      if (score > fuzzyScore && score >= 0.72) {
        fuzzyScore = score;
        fuzzy = { text: dest, match: 0.86 };
      }
    }
  }
  return fuzzy;
}

function remember(key: string, result: Translation): Translation {
  if (clientCache.has(key)) clientCache.delete(key);
  clientCache.set(key, result);
  while (clientCache.size > CLIENT_CACHE_MAX) {
    const oldest = clientCache.keys().next().value;
    if (oldest !== undefined) clientCache.delete(oldest);
  }
  return result;
}

/**
 * 1) cartão aprovado (offline)
 * 2) IA no backend
 * 3) MyMemory se o servidor não tiver chave
 * navigator.onLine NÃO decide nada — no telemóvel mente.
 */
export async function machineTranslate(text: string, from: SessionLang, to: SessionLang): Promise<Translation> {
  if (from === to) return { text, match: 1 };
  const key = `${from}|${to}|${text}`;
  const hit = clientCache.get(key);
  if (hit) return hit;

  const card = cardTranslate(text, from, to);
  if (card && card.match >= 0.95) return remember(key, card);

  try {
    const res = await apiFetch("/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, from, to }),
      timeoutMs: 12_000,
      retries: 1,
    });
    if (res.status === 503) {
      const mm = await myMemoryTranslate(text, from, to).catch(() => null);
      if (mm) return remember(key, mm);
      if (card) return remember(key, card);
      throw new Error("translate: HTTP 503");
    }
    if (!res.ok) throw new Error(`translate: HTTP ${res.status}`);
    const data = (await res.json()) as { text?: string };
    const out = data.text?.trim();
    if (!out) throw new Error("translate: empty");
    return remember(key, { text: out, match: 0.95 });
  } catch (err) {
    if (card) return remember(key, card);
    const mm = await myMemoryTranslate(text, from, to).catch(() => null);
    if (mm) return remember(key, mm);
    throw err instanceof Error ? err : new Error("translate");
  }
}

async function myMemoryTranslate(text: string, from: SessionLang, to: SessionLang): Promise<Translation> {
  const url =
    "https://api.mymemory.translated.net/get?q=" +
    encodeURIComponent(text) +
    "&langpair=" +
    encodeURIComponent(`${MT_LANG[from]}|${MT_LANG[to]}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`translate: HTTP ${res.status}`);
  const data = (await res.json()) as {
    responseStatus: number | string;
    responseData?: { translatedText?: string; match?: number };
  };
  const out = data.responseData?.translatedText?.trim();
  if (Number(data.responseStatus) !== 200 || !out) throw new Error("translate: bad response");
  return { text: out, match: Number(data.responseData?.match ?? 0) };
}
