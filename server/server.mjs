import { createServer } from "node:http";
import { randomBytes, randomInt } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import compression from "compression";
import { WebSocketServer } from "ws";
import { createRoomsRouter } from "./rooms.mjs";
import { createSupaStore } from "./supaStore.mjs";
import {
  createMockTranslator,
  createOpenRouterTranslator,
  createOpenRouterTts,
  createWhisperTranscriber,
} from "./providers.mjs";
import { configuredPublicOrigin, describeOrigin, lanOrigin, originFor } from "./origin.mjs";
import { cardTranslate } from "./cardTranslate.mjs";
import { createPairStore, joinPublicUrl, PUBLIC_SITE } from "./pairStore.mjs";

export { originFor } from "./origin.mjs";

const TTL_MS = 2 * 60 * 60 * 1000; // session lifetime
const EMPTY_GRACE_MS = 5 * 60 * 1000; // both offline -> delete
const LANGS = new Set(["pt", "pt-BR", "pt-PT", "pt-AO", "tr", "en", "fr"]);
// no 0/O/1/I to keep the 6-char code readable on a ward phone
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** @type {Map<string, Session>} */
const sessions = new Map();
const pairStore = createPairStore();

/**
 * @typedef {Object} Participant
 * @property {string} token
 * @property {string} lang
 * @property {import("ws").WebSocket | null} ws
 *
 * @typedef {Object} Session
 * @property {string} code
 * @property {number} expiresAt
 * @property {"waiting" | "active" | "ended"} status
 * @property {Participant} a
 * @property {Participant | null} b
 * @property {number | null} emptySince
 */

function newCode() {
  for (;;) {
    let code = "";
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!sessions.has(code)) return code;
  }
}

function newToken() {
  return randomBytes(16).toString("hex");
}

function getLive(code) {
  const s = sessions.get(String(code || "").toUpperCase());
  if (!s) return null;
  if (s.status === "ended" || Date.now() > s.expiresAt) {
    sessions.delete(s.code);
    return null;
  }
  return s;
}

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function peerOf(session, role) {
  return role === "a" ? session.b : session.a;
}

function endSession(session) {
  session.status = "ended";
  send(session.a.ws, { type: "end" });
  if (session.b) send(session.b.ws, { type: "end" });
  session.a.ws?.close();
  session.b?.ws?.close();
  sessions.delete(session.code);
}

setInterval(() => {
  const now = Date.now();
  for (const s of [...sessions.values()]) {
    const bothOffline = !s.a.ws && (!s.b || !s.b.ws);
    if (now > s.expiresAt) endSession(s);
    else if (bothOffline && s.emptySince && now - s.emptySince > EMPTY_GRACE_MS) endSession(s);
  }
}, 60_000).unref();

/** Tradutor real (OpenRouter) quando há chave; null caso contrário. */
function realTranslator() {
  const { OPENROUTER_API_KEY, OPENROUTER_MODEL } = process.env;
  return OPENROUTER_API_KEY
    ? createOpenRouterTranslator({ apiKey: OPENROUTER_API_KEY, model: OPENROUTER_MODEL || "openai/gpt-4o-mini" })
    : null;
}

function realTts() {
  const { OPENROUTER_API_KEY, OPENROUTER_TTS_MODEL } = process.env;
  return OPENROUTER_API_KEY
    ? createOpenRouterTts({ apiKey: OPENROUTER_API_KEY, model: OPENROUTER_TTS_MODEL })
    : null;
}

/** Salas multi-participante (Supabase). Devolve null se o .env não estiver configurado. */
function roomsSetup(translate) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STT_API_KEY, STT_API_URL, STT_MODEL, OPENROUTER_API_KEY } =
    process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  const store = createSupaStore({ url: SUPABASE_URL, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY });
  const sttKey = STT_API_KEY || OPENROUTER_API_KEY;
  const viaOpenRouter = Boolean(OPENROUTER_API_KEY) && !STT_API_KEY;
  const transcribe = sttKey
    ? createWhisperTranscriber({
        apiKey: sttKey,
        url: STT_API_URL || (viaOpenRouter ? "https://openrouter.ai/api/v1/audio/transcriptions" : undefined),
        model: STT_MODEL || (viaOpenRouter ? "openai/whisper-large-v3" : "whisper-1"),
      })
    : null;
  return { store, translate: translate ?? createMockTranslator(), transcribe };
}

export function createApp() {
  const app = express();
  app.set("trust proxy", true);
  app.use((req, res, next) => {
    const origin = String(req.headers.origin || "");
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    else res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, bypass-tunnel-reminder");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json());

  const ai = realTranslator();
  const translate = async (text, from, to) => {
    const card = cardTranslate(text, from, to);
    if (card) return card;
    if (!ai) throw Object.assign(new Error("translator not configured"), { code: 503 });
    return ai(text, from, to);
  };
  const tts = realTts();
  const rooms = roomsSetup(translate);

  // Cartões aprovados primeiro (offline). IA só se não houver cartão.
  app.post("/api/translate", (req, res) => {
    const { text, from, to } = req.body ?? {};
    const clean = String(text || "").trim().slice(0, 2000);
    if (!clean || !LANGS.has(from) || !LANGS.has(to)) return res.status(400).json({ error: "bad request" });
    translate(clean, from, to)
      .then((out) => res.json({ text: out }))
      .catch((err) => {
        if (err?.code === 503) return res.status(503).json({ error: "translator not configured" });
        console.warn("[translate]", err?.message || err);
        res.status(502).json({ error: "translate failed" });
      });
  });

  app.post("/api/tts", (req, res) => {
    if (!tts) return res.status(503).json({ error: "tts not configured" });
    const text = String(req.body?.text || "").trim().slice(0, 500);
    const lang = String(req.body?.lang || "pt");
    if (!text) return res.status(400).json({ error: "bad request" });
    tts(text, lang)
      .then((buf) => {
        res.setHeader("content-type", "audio/mpeg");
        res.setHeader("cache-control", "no-store");
        res.send(Buffer.from(buf));
      })
      .catch((err) => {
        console.warn("[tts]", err?.message || err);
        res.status(502).json({ error: "tts failed" });
      });
  });

  app.get("/api/rooms-meta", (_req, res) => {
    res.json({
      enabled: Boolean(rooms),
      stt: Boolean(rooms?.transcribe),
      tts: Boolean(tts),
      realTranslate: Boolean(translate),
      model: process.env.OPENROUTER_MODEL || (translate ? "openai/gpt-4o-mini" : null),
    });
  });

  app.get("/api/diag", (req, res) => {
    const origin = originFor(req);
    const info = describeOrigin(origin);
    res.json({
      ok: true,
      ...info,
      public: configuredPublicOrigin() || "",
      lan: lanOrigin(req),
      rooms: Boolean(rooms),
      stt: Boolean(rooms?.transcribe),
      tts: Boolean(tts),
      realTranslate: Boolean(translate),
      model: process.env.OPENROUTER_MODEL || (translate ? "openai/gpt-4o-mini" : null),
    });
  });
  if (rooms) {
    app.use(
      "/api/rooms",
      createRoomsRouter({
        store: rooms.store,
        translate: rooms.translate,
        transcribe: rooms.transcribe,
        originFor,
      })
    );
  } else {
    app.use("/api/rooms", (_req, res) => {
      res.status(503).json({
        error: "rooms not configured",
        detail: "Define SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env (ver .env.example)",
      });
    });
  }

  function makeSession(lang) {
    if (!LANGS.has(lang)) return null;
    const session = {
      code: newCode(),
      expiresAt: Date.now() + TTL_MS,
      status: "waiting",
      a: { token: newToken(), lang, ws: null },
      b: null,
      emptySince: null,
    };
    sessions.set(session.code, session);
    return session;
  }

  function sessionCreated(_req, res, session) {
    res.json({
      code: session.code,
      token: session.a.token,
      publicUrl: joinPublicUrl(session.code),
    });
  }

  async function persistPair(session) {
    if (!pairStore) return;
    try {
      await pairStore.insert({
        code: session.code,
        status: session.status,
        a_token: session.a.token,
        a_lang: session.a.lang,
        b_token: session.b?.token ?? null,
        b_lang: session.b?.lang ?? null,
        expires_at: new Date(session.expiresAt).toISOString(),
      });
    } catch (err) {
      console.warn("[pair_sessions]", err?.message || err);
    }
  }

  async function hydratePair(code) {
    const live = getLive(code);
    if (live) return live;
    if (!pairStore) return null;
    try {
      const row = await pairStore.get(code);
      if (!row) return null;
      const session = {
        code: row.code,
        expiresAt: new Date(row.expires_at).getTime(),
        status: row.status,
        a: { token: row.a_token, lang: row.a_lang, ws: null },
        b: row.b_token ? { token: row.b_token, lang: row.b_lang, ws: null } : null,
        emptySince: null,
      };
      sessions.set(session.code, session);
      return session;
    } catch {
      return null;
    }
  }

  app.post("/api/session", async (req, res) => {
    const session = makeSession(req.body?.lang);
    if (!session) return res.status(400).json({ error: "bad lang" });
    await persistPair(session);
    sessionCreated(req, res, session);
  });

  /** GET fallback — alguns túneis bloqueiam POST. Tem de ficar antes de /:code. */
  app.get("/api/session/new", async (req, res) => {
    const session = makeSession(req.query.lang);
    if (!session) return res.status(400).json({ error: "bad lang" });
    await persistPair(session);
    sessionCreated(req, res, session);
  });

  app.get("/api/session/:code", async (req, res) => {
    const s = await hydratePair(req.params.code);
    if (!s) return res.status(404).json({ error: "not found" });
    res.json({ creatorLang: s.a.lang, status: s.status });
  });

  /** Phone-reachable origin for QR codes (never localhost). */
  app.get("/api/invite-origin", (req, res) => {
    const lan = lanOrigin(req);
    const info = describeOrigin(PUBLIC_SITE);
    res.json({
      origin: PUBLIC_SITE,
      public: PUBLIC_SITE,
      lan,
      ...info,
    });
  });

  app.post("/api/session/:code/join", async (req, res) => {
    const s = await hydratePair(req.params.code);
    if (!s) return res.status(404).json({ error: "not found" });
    const lang = req.body?.lang;
    if (!LANGS.has(lang)) return res.status(400).json({ error: "bad lang" });
    if (s.b) return res.status(409).json({ error: "session full" });
    s.b = { token: newToken(), lang, ws: null };
    s.status = "active";
    if (pairStore) {
      try {
        await pairStore.join(s.code, lang, s.b.token);
      } catch (err) {
        console.warn("[pair_sessions join]", err?.message || err);
      }
    }
    send(s.a.ws, { type: "joined", lang });
    res.json({ token: s.b.token, creatorLang: s.a.lang });
  });

  return app;
}

export function attachWs(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://x");
    const s = getLive(url.searchParams.get("code"));
    const token = url.searchParams.get("token");
    const role = s && token === s.a.token ? "a" : s && s.b && token === s.b.token ? "b" : null;
    if (!s || !role) {
      send(ws, { type: "error", error: "invalid session" });
      ws.close();
      return;
    }
    const me = role === "a" ? s.a : s.b;
    me.ws?.close();
    me.ws = ws;
    s.emptySince = null;

    const peer = peerOf(s, role);
    send(ws, {
      type: "hello",
      role,
      status: s.status,
      peerLang: peer ? peer.lang : null,
      peerOnline: Boolean(peer?.ws),
    });
    if (peer) send(peer.ws, { type: "peer", online: true });

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.type === "ping") {
        send(ws, { type: "pong" });
        return;
      }
      if (msg.type === "end") {
        endSession(s);
        return;
      }
      if (msg.type === "interim" || msg.type === "utterance" || msg.type === "speaking") {
        send(peerOf(s, role)?.ws, msg);
      }
    });

    ws.on("close", () => {
      if (me.ws === ws) me.ws = null;
      const p = peerOf(s, role);
      if (p) send(p.ws, { type: "peer", online: false });
      if (!s.a.ws && (!s.b || !s.b.ws)) s.emptySince = Date.now();
    });
  });

  return wss;
}

export function startServer(port) {
  const app = createApp();
  const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
  app.use(compression());
  app.use(
    express.static(dist, {
      fallthrough: true,
      maxAge: "1h",
      setHeaders(res, filePath) {
        if (/\.(?:html|webmanifest|json)$/i.test(filePath) || /(?:^|[/\\])(?:sw|workbox|registerSW)/i.test(filePath)) {
          res.setHeader("Cache-Control", "no-store");
        } else if (/\.[a-f0-9]{8,}\.(?:js|css|woff2)$/i.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );
  // SPA fallback — phones opening /join/CODE or /?join=CODE must get index.html
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(dist, "index.html"));
  });

  const httpServer = createServer(app);
  attachWs(httpServer);
  return new Promise((resolve) => {
    httpServer.listen(port, "0.0.0.0", () => resolve(httpServer));
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT || 8787);
  await startServer(port);
  console.log(`TIKA MZ Translator server on http://localhost:${port}`);
}
