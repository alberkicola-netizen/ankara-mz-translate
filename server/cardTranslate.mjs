import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pack = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "phrases.json"), "utf8"),
);
const PHRASES = Array.isArray(pack.phrases) ? pack.phrases : [];

function packLang(lang) {
  if (lang === "tr") return "tr";
  if (lang === "en") return "en";
  if (String(lang).startsWith("pt")) return "pt";
  return null;
}

function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tradução instantânea pelos cartões aprovados — sem internet. */
export function cardTranslate(text, from, to) {
  const a = packLang(from);
  const b = packLang(to);
  if (!a || !b || a === b) return null;
  const q = fold(text);
  if (q.length < 2) return null;
  let fuzzy = null;
  let fuzzyScore = 0;
  for (const p of PHRASES) {
    const src = fold(p[a]);
    const dest = String(p[b] || "").trim();
    if (!src || !dest) continue;
    if (src === q) return dest;
    if (src.includes(q) || q.includes(src)) {
      const score = Math.min(src.length, q.length) / Math.max(src.length, q.length);
      if (score > fuzzyScore && score >= 0.72) {
        fuzzyScore = score;
        fuzzy = dest;
      }
    }
  }
  return fuzzy;
}
