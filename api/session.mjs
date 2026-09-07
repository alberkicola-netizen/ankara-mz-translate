import { cors, readJson } from "../server/http.mjs";
import { createPairStore, joinPublicUrl, newPairCode, newPairToken } from "../server/pairStore.mjs";

const LANGS = new Set(["pt", "pt-BR", "pt-PT", "pt-AO", "tr", "en", "fr"]);
const TTL_MS = 2 * 60 * 60 * 1000;

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const lang = readJson(req).lang;
  if (!LANGS.has(lang)) return res.status(400).json({ error: "bad lang" });
  const store = createPairStore();
  if (!store) return res.status(503).json({ error: "store" });
  let last = "create failed";
  for (let i = 0; i < 8; i++) {
    const code = newPairCode();
    const token = newPairToken();
    try {
      await store.insert({
        code,
        status: "waiting",
        a_token: token,
        a_lang: lang,
        b_token: null,
        b_lang: null,
        expires_at: new Date(Date.now() + TTL_MS).toISOString(),
      });
      return res.status(200).json({ code, token, publicUrl: joinPublicUrl(code) });
    } catch (err) {
      last = err instanceof Error ? err.message : "create failed";
    }
  }
  return res.status(500).json({ error: last });
}
