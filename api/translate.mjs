import { cors, readJson } from "../server/http.mjs";
import { cardTranslate } from "../server/cardTranslate.mjs";
import { createOpenRouterTranslator } from "../server/providers.mjs";

const LANGS = new Set(["pt", "pt-BR", "pt-PT", "pt-AO", "tr", "en", "fr"]);

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const body = readJson(req);
  const text = String(body.text || "").trim().slice(0, 2000);
  const from = body.from;
  const to = body.to;
  if (!text || !LANGS.has(from) || !LANGS.has(to)) return res.status(400).json({ error: "bad request" });
  const card = cardTranslate(text, from, to);
  if (card) return res.status(200).json({ text: card });
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "translator not configured" });
  try {
    const ai = createOpenRouterTranslator({
      apiKey,
      model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
      timeoutMs: 8_000,
    });
    const out = await ai(text, from, to);
    return res.status(200).json({ text: out });
  } catch (err) {
    console.warn("[translate]", err instanceof Error ? err.message : err);
    return res.status(502).json({ error: "translate failed" });
  }
}
