import { createApp } from "../server/server.mjs";

const app = createApp();

/** Catch-all: /api/session/CODE e /api/translate chegam aqui com o path original. */
export default function handler(req, res) {
  const raw = String(req.url || "");
  if (!raw.startsWith("/api")) {
    const parts = req.query?.path;
    const suffix = Array.isArray(parts) ? parts.join("/") : parts ? String(parts) : "";
    req.url = suffix ? `/api/${suffix}` : "/api";
  }
  return app(req, res);
}
