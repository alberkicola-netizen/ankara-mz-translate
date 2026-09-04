import { randomInt, randomUUID } from "node:crypto";
import express from "express";
import multer from "multer";

export const ROOM_LANGS = new Set(["pt", "pt-BR", "pt-PT", "pt-AO", "tr", "en", "fr"]);
export const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

/** Whisper accepts ISO-639-1; Portuguese variants all map to "pt". */
function whisperLang(code) {
  const c = String(code || "").toLowerCase();
  if (c.startsWith("pt")) return "pt";
  return c.slice(0, 2);
}
export const MAX_PARTICIPANTS = 10;
// mesmo alfabeto legível das sessões 2-pessoas (sem 0/O/1/I)
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Gera um código de sala de 6 caracteres que ainda não exista. */
export async function newRoomCode(exists) {
  for (let attempt = 0; attempt < 30; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!(await exists(code))) return code;
  }
  throw new Error("room code space exhausted");
}

/**
 * Roteamento por idioma: idiomas-alvo distintos dos outros participantes.
 * Uma linha de utterance será criada por cada idioma devolvido.
 */
export function fanOutTargets(participants, senderId) {
  const targets = new Set();
  for (const p of participants) {
    if (p.id === senderId) continue;
    if (p.target_language) targets.add(p.target_language);
  }
  return [...targets];
}

function roomIsExpired(room) {
  return room.expires_at && Date.now() > new Date(room.expires_at).getTime();
}

/**
 * Broadcast best-effort: a linha já está gravada no Postgres, por isso uma
 * falha momentânea do Realtime não pode derrubar o pedido HTTP — quem
 * recarregar a página recebe a mensagem pelo histórico.
 */
async function safeBroadcast(store, roomId, event, payload) {
  try {
    await store.broadcast(roomId, event, payload);
  } catch (err) {
    console.warn(`[rooms] broadcast ${event} falhou:`, err?.message || err);
  }
}

/** Formato único de mensagem enviado ao frontend (histórico e broadcast). */
function toMessage(row, fromName) {
  return {
    utteranceId: row.id,
    clientKey: row.client_key || row.id,
    fromId: row.from_participant_id,
    fromName,
    sourceLanguage: row.source_language,
    sourceText: row.source_text,
    targetLanguage: row.target_language,
    translatedText: row.translated_text ?? null,
    failed: Boolean(row.failed),
    pending: row.translated_text == null && !row.failed,
    at: row.created_at,
  };
}

/**
 * Fluxo completo de uma fala:
 *  1) uma linha em `utterances` por idioma-alvo, gravada ANTES de distribuir;
 *  2) broadcast imediato `new_utterance` com o original ("a traduzir…");
 *  3) traduções em paralelo (Promise.allSettled) — nunca bloqueiam a sala;
 *  4) update da linha + broadcast `utterance_translated` (ou `failed`).
 * Devolve as linhas criadas e a promise das traduções (o handler HTTP não a espera).
 */
export async function dispatchUtterance({ store, translate }, { room, sender, participants, text }) {
  const targets = fanOutTargets(participants, sender.id);
  const clientKey = randomUUID();
  const rows = [];

  for (const target of targets) {
    const row = await store.insertUtterance({
      room_id: room.id,
      from_participant_id: sender.id,
      source_language: sender.source_language,
      source_text: text,
      target_language: target,
      translated_text: null,
      failed: false,
      client_key: clientKey,
    });
    rows.push(row);
    await safeBroadcast(store, room.id, "new_utterance", toMessage(row, sender.display_name));
  }

  const translationDone = Promise.allSettled(
    rows.map(async (row) => {
      let translated = null;
      let failed = false;
      try {
        // Mesmo idioma: não chamar a IA (mais rápido e evita eco inútil).
        translated =
          sender.source_language === row.target_language
            ? text
            : await translate(text, sender.source_language, row.target_language);
      } catch {
        failed = true;
      }
      try {
        await store.updateUtterance(row.id, { translated_text: translated, failed });
      } catch {
        failed = true;
      }
      await safeBroadcast(store, room.id, "utterance_translated", {
        utteranceId: row.id,
        clientKey,
        fromId: sender.id,
        targetLanguage: row.target_language,
        translatedText: translated,
        failed,
      });
    })
  );

  return { rows, clientKey, translationDone };
}

/**
 * Router Express das salas multi-participante.
 * `store`, `translate` e `transcribe` são injetáveis (fakes nos testes).
 */
export function createRoomsRouter({ store, translate, transcribe, originFor }) {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

  /** Carrega a sala e valida que está aberta; responde com o erro adequado. */
  async function liveRoom(req, res) {
    const id = String(req.params.id || "").toUpperCase();
    const room = await store.getRoom(id);
    if (!room) {
      res.status(404).json({ error: "room not found" });
      return null;
    }
    if (room.status !== "open" || roomIsExpired(room)) {
      res.status(410).json({ error: "room closed" });
      return null;
    }
    return room;
  }

  function validLangs(body) {
    return ROOM_LANGS.has(body?.sourceLanguage) && ROOM_LANGS.has(body?.targetLanguage);
  }

  function cleanName(body) {
    return String(body?.displayName || "").trim().slice(0, 40);
  }

  const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

  // Criar sala: anfitrião + linha em rooms; devolve URL pública para o QR.
  router.post(
    "/",
    wrap(async (req, res) => {
      const displayName = cleanName(req.body);
      if (!displayName || !validLangs(req.body)) {
        return res.status(400).json({ error: "bad request" });
      }
      const id = await newRoomCode(async (code) => Boolean(await store.getRoom(code)));
      await store.createRoom({
        id,
        status: "open",
        max_participants: MAX_PARTICIPANTS,
        expires_at: new Date(Date.now() + ROOM_TTL_MS).toISOString(),
      });
      const host = await store.addParticipant({
        room_id: id,
        display_name: displayName,
        source_language: req.body.sourceLanguage,
        target_language: req.body.targetLanguage,
        is_online: true,
      });
      await store.setRoomHost(id, host.id);
      const origin = originFor ? originFor(req) : "";
      res.json({
        roomId: id,
        participantId: host.id,
        publicUrl: `${origin}/join-room/${id}`,
        expiresAt: new Date(Date.now() + ROOM_TTL_MS).toISOString(),
      });
    })
  );

  // Info da sala (para a página de entrada): idiomas ativos e lotação.
  router.get(
    "/:id",
    wrap(async (req, res) => {
      const room = await liveRoom(req, res);
      if (!room) return;
      const participants = await store.listParticipants(room.id);
      res.json({
        roomId: room.id,
        status: room.status,
        participantCount: participants.length,
        maxParticipants: room.max_participants,
        languages: [...new Set(participants.map((p) => p.source_language))],
      });
    })
  );

  router.post(
    "/:id/join",
    wrap(async (req, res) => {
      const room = await liveRoom(req, res);
      if (!room) return;
      const displayName = cleanName(req.body);
      if (!displayName || !validLangs(req.body)) {
        return res.status(400).json({ error: "bad request" });
      }
      const participants = await store.listParticipants(room.id);
      if (participants.length >= room.max_participants) {
        return res.status(409).json({ error: "room full" });
      }
      const p = await store.addParticipant({
        room_id: room.id,
        display_name: displayName,
        source_language: req.body.sourceLanguage,
        target_language: req.body.targetLanguage,
        is_online: true,
      });
      res.json({ roomId: room.id, participantId: p.id });
    })
  );

  // Histórico filtrado: mensagens dirigidas ao meu idioma + as minhas falas (originais).
  router.get(
    "/:id/utterances",
    wrap(async (req, res) => {
      const room = await liveRoom(req, res);
      if (!room) return;
      const me = await store.getParticipant(String(req.query.participantId || ""));
      if (!me || me.room_id !== room.id) return res.status(403).json({ error: "not in room" });

      const rows = await store.listUtterances(room.id, me);
      const participants = await store.listParticipants(room.id);
      const names = new Map(participants.map((p) => [p.id, p.display_name]));

      const seenOwn = new Set();
      const messages = [];
      for (const row of rows) {
        if (row.from_participant_id === me.id) {
          // as minhas falas geram uma linha por idioma-alvo — mostrar só uma
          const key = row.client_key || row.id;
          if (seenOwn.has(key)) continue;
          seenOwn.add(key);
          messages.push({ ...toMessage(row, names.get(row.from_participant_id) || "?"), mine: true });
        } else if (row.target_language === me.target_language) {
          messages.push({ ...toMessage(row, names.get(row.from_participant_id) || "?"), mine: false });
        }
      }
      res.json({ messages });
    })
  );

  // Fase 1: fala por texto (fica como fallback de microfone na Fase 2).
  router.post(
    "/:id/utterance",
    wrap(async (req, res) => {
      const room = await liveRoom(req, res);
      if (!room) return;
      const sender = await store.getParticipant(String(req.body?.participantId || ""));
      if (!sender || sender.room_id !== room.id) return res.status(403).json({ error: "not in room" });
      const text = String(req.body?.text || "").trim().slice(0, 2000);
      if (!text) return res.status(400).json({ error: "empty text" });

      const participants = await store.listParticipants(room.id);
      const { rows, clientKey, translationDone } = await dispatchUtterance(
        { store, translate },
        { room, sender, participants, text }
      );
      translationDone.catch(() => {});
      res.json({ ok: true, clientKey, utteranceIds: rows.map((r) => r.id), text });
    })
  );

  // Fase 2: voz por push-to-talk → Whisper → mesmo fluxo da fala por texto.
  router.post(
    "/:id/speak",
    upload.single("audio"),
    wrap(async (req, res) => {
      if (!transcribe) return res.status(503).json({ error: "stt not configured" });
      const room = await liveRoom(req, res);
      if (!room) return;
      const sender = await store.getParticipant(String(req.body?.participantId || ""));
      if (!sender || sender.room_id !== room.id) return res.status(403).json({ error: "not in room" });
      if (!req.file?.buffer?.length) return res.status(400).json({ error: "no audio" });

      let text;
      try {
        text = await transcribe({
          buffer: req.file.buffer,
          mimetype: req.file.mimetype,
          filename: req.file.originalname || "audio.webm",
          language: whisperLang(sender.source_language),
        });
      } catch {
        return res.status(502).json({ error: "stt failed" });
      }
      if (!text) return res.status(422).json({ error: "nothing recognized" });

      const participants = await store.listParticipants(room.id);
      const { rows, clientKey, translationDone } = await dispatchUtterance(
        { store, translate },
        { room, sender, participants, text }
      );
      translationDone.catch(() => {});
      res.json({ ok: true, clientKey, utteranceIds: rows.map((r) => r.id), text });
    })
  );

  // Encerrar: só o anfitrião; todos recebem room_closed.
  router.post(
    "/:id/close",
    wrap(async (req, res) => {
      const room = await liveRoom(req, res);
      if (!room) return;
      const participantId = String(req.body?.participantId || "");
      if (!participantId || participantId !== room.host_participant_id) {
        return res.status(403).json({ error: "only the host can close the room" });
      }
      await store.closeRoom(room.id);
      await safeBroadcast(store, room.id, "room_closed", { roomId: room.id });
      res.json({ ok: true });
    })
  );

  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, next) => {
    console.error("[rooms]", err?.message || err);
    res.status(500).json({ error: "internal error" });
  });

  return router;
}
