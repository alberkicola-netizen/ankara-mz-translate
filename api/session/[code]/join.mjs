import { cors, readJson } from "../../../server/http.mjs";
import { createPairStore, newPairToken } from "../../../server/pairStore.mjs";

const LANGS = new Set(["pt", "pt-BR", "pt-PT", "pt-AO", "tr", "en", "fr"]);

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const code = String(req.query.code || "").trim().toUpperCase();
  const lang = readJson(req).lang;
  if (!code || !LANGS.has(lang)) return res.status(400).json({ error: "bad request" });
  const store = createPairStore();
  if (!store) return res.status(503).json({ error: "store" });
  try {
    const token = newPairToken();
    const out = await store.join(code, lang, token);
    if (out === "gone") return res.status(404).json({ error: "not found" });
    if (out === "full") return res.status(409).json({ error: "session full" });
    return res.status(200).json({ token: out.b_token || token, creatorLang: out.a_lang || "pt" });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "join failed" });
  }
}
