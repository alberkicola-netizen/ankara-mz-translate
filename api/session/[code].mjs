import { cors } from "../../server/http.mjs";
import { createPairStore } from "../../server/pairStore.mjs";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method" });
  const code = String(req.query.code || "").trim().toUpperCase();
  if (!code || code === "NEW") return res.status(400).json({ error: "bad code" });
  const store = createPairStore();
  if (!store) return res.status(503).json({ error: "store" });
  try {
    const row = await store.get(code);
    if (!row) return res.status(404).json({ error: "not found" });
    return res.status(200).json({ creatorLang: row.a_lang || "pt", status: row.status || "waiting" });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "lookup failed" });
  }
}
