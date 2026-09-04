import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createRoomsRouter, dispatchUtterance, fanOutTargets, newRoomCode } from "./rooms.mjs";

/** Store em memória com a mesma interface do supaStore — os testes correm sem rede. */
function fakeStore() {
  const rooms = new Map();
  const participants = new Map();
  const utterances = new Map();
  const broadcasts = [];
  let n = 0;
  return {
    rooms,
    participants,
    utterances,
    broadcasts,
    async getRoom(id) {
      return rooms.get(id) ?? null;
    },
    async createRoom(row) {
      const r = { status: "open", host_participant_id: null, ...row };
      rooms.set(row.id, r);
      return r;
    },
    async setRoomHost(id, pid) {
      rooms.get(id).host_participant_id = pid;
    },
    async closeRoom(id) {
      rooms.get(id).status = "closed";
    },
    async addParticipant(row) {
      const p = { id: `p${++n}`, joined_at: new Date().toISOString(), ...row };
      participants.set(p.id, p);
      return p;
    },
    async getParticipant(id) {
      return participants.get(id) ?? null;
    },
    async listParticipants(roomId) {
      return [...participants.values()].filter((p) => p.room_id === roomId);
    },
    async insertUtterance(row) {
      const u = { id: `u${++n}`, created_at: new Date().toISOString(), ...row };
      utterances.set(u.id, u);
      return u;
    },
    async updateUtterance(id, patch) {
      Object.assign(utterances.get(id), patch);
    },
    async listUtterances(roomId, me) {
      return [...utterances.values()].filter(
        (u) =>
          u.room_id === roomId &&
          (u.target_language === me.target_language || u.from_participant_id === me.id),
      );
    },
    async broadcast(roomId, event, payload) {
      broadcasts.push({ roomId, event, payload });
    },
  };
}

const mockTranslate = async (text, _from, to) => `[${to}] ${text}`;

function makeApp(deps) {
  const app = express();
  app.use(express.json());
  app.use("/api/rooms", createRoomsRouter({ originFor: () => "https://example.test", ...deps }));
  return app;
}

async function withServer(app, fn) {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

async function post(base, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function seedRoom(store, langs) {
  const room = await store.createRoom({
    id: "SALA22",
    max_participants: 10,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  const people = [];
  for (const [display_name, source_language, target_language] of langs) {
    people.push(
      await store.addParticipant({ room_id: "SALA22", display_name, source_language, target_language, is_online: true }),
    );
  }
  if (people[0]) await store.setRoomHost("SALA22", people[0].id);
  return { room: await store.getRoom("SALA22"), people };
}

test("newRoomCode gera 6 caracteres legíveis e evita colisões", async () => {
  const code = await newRoomCode(async () => false);
  assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);

  const taken = new Set([code]);
  const other = await newRoomCode(async (c) => taken.has(c));
  assert.notEqual(other, code);
});

test("fanOutTargets: idiomas-alvo distintos, excluindo o remetente", () => {
  const people = [
    { id: "a", target_language: "pt" },
    { id: "b", target_language: "tr" },
    { id: "c", target_language: "tr" },
    { id: "d", target_language: "en" },
  ];
  assert.deepEqual(fanOutTargets(people, "a").sort(), ["en", "tr"]);
  assert.deepEqual(fanOutTargets(people, "d").sort(), ["pt", "tr"]);
  assert.deepEqual(fanOutTargets([people[0]], "a"), []);
});

test("variantes de português: aceites e traduzidas entre si (não saltam a IA)", async () => {
  const store = fakeStore();
  await withServer(makeApp({ store, translate: mockTranslate }), async (base) => {
    const created = await post(base, "/api/rooms", {
      displayName: "Host",
      sourceLanguage: "pt",
      targetLanguage: "pt-BR",
    });
    assert.equal(created.status, 200);
    const join = await post(base, `/api/rooms/${created.body.roomId}/join`, {
      displayName: "Ana",
      sourceLanguage: "pt-AO",
      targetLanguage: "pt-PT",
    });
    assert.equal(join.status, 200);
  });

  const { room, people } = await seedRoom(store, [
    ["Amina", "pt", "pt"],
    ["João", "pt-BR", "pt-BR"],
    ["Maria", "pt-PT", "pt-PT"],
  ]);
  const { rows, translationDone } = await dispatchUtterance(
    { store, translate: mockTranslate },
    { room, sender: people[0], participants: people, text: "Bom dia" },
  );
  await translationDone;
  assert.deepEqual(rows.map((r) => r.target_language).sort(), ["pt-BR", "pt-PT"]);
  const br = store.broadcasts.find((b) => b.event === "utterance_translated" && b.payload.targetLanguage === "pt-BR");
  assert.equal(br.payload.translatedText, "[pt-BR] Bom dia");
});

test("criar sala: anfitrião registado e URL pública /?room=", async () => {
  const store = fakeStore();
  await withServer(makeApp({ store, translate: mockTranslate }), async (base) => {
    const { status, body } = await post(base, "/api/rooms", {
      displayName: "Amina",
      sourceLanguage: "pt",
      targetLanguage: "tr",
    });
    assert.equal(status, 200);
    assert.match(body.roomId, /^[A-Z2-9]{6}$/);
    assert.equal(body.publicUrl, `https://example.test/join-room/${body.roomId}`);
    const room = await store.getRoom(body.roomId);
    assert.equal(room.host_participant_id, body.participantId);
  });
});

test("validações: sala inexistente 404, fechada/expirada 410, cheia 409, idioma inválido 400", async () => {
  const store = fakeStore();
  const app = makeApp({ store, translate: mockTranslate });
  await withServer(app, async (base) => {
    const joinBody = { displayName: "Bekir", sourceLanguage: "tr", targetLanguage: "pt" };

    assert.equal((await post(base, "/api/rooms/NADA99/join", joinBody)).status, 404);

    await seedRoom(store, [["Amina", "pt", "tr"]]);
    assert.equal((await post(base, "/api/rooms/SALA22/join", { ...joinBody, sourceLanguage: "xx" })).status, 400);
    assert.equal((await post(base, "/api/rooms/SALA22/join", joinBody)).status, 200);

    store.rooms.get("SALA22").max_participants = 2;
    assert.equal((await post(base, "/api/rooms/SALA22/join", joinBody)).status, 409, "sala cheia");

    store.rooms.get("SALA22").expires_at = new Date(Date.now() - 1000).toISOString();
    assert.equal((await post(base, "/api/rooms/SALA22/join", joinBody)).status, 410, "expirada");

    store.rooms.get("SALA22").expires_at = new Date(Date.now() + 60_000).toISOString();
    store.rooms.get("SALA22").status = "closed";
    assert.equal((await post(base, "/api/rooms/SALA22/join", joinBody)).status, 410, "fechada");
  });
});

test("dispatchUtterance: uma linha por idioma-alvo, gravada antes do broadcast, em duas etapas", async () => {
  const store = fakeStore();
  const { room, people } = await seedRoom(store, [
    ["Amina", "pt", "pt"], // remetente: fala pt, recebe pt
    ["Bekir", "tr", "tr"],
    ["Cansu", "tr", "tr"], // idioma repetido → apenas 1 linha tr
    ["David", "en", "en"],
  ]);

  const { rows, translationDone } = await dispatchUtterance(
    { store, translate: mockTranslate },
    { room, sender: people[0], participants: people, text: "Bom dia" },
  );
  await translationDone;

  assert.deepEqual(rows.map((r) => r.target_language).sort(), ["en", "tr"]);
  // remetente (pt) excluído do fan-out
  assert.ok(!rows.some((r) => r.target_language === "pt"));

  const news = store.broadcasts.filter((b) => b.event === "new_utterance");
  const done = store.broadcasts.filter((b) => b.event === "utterance_translated");
  assert.equal(news.length, 2);
  assert.equal(done.length, 2);
  assert.ok(news.every((b) => b.payload.pending === true && b.payload.sourceText === "Bom dia"));
  const tr = done.find((b) => b.payload.targetLanguage === "tr");
  assert.equal(tr.payload.translatedText, "[tr] Bom dia");
  assert.equal(tr.payload.failed, false);
  assert.equal(tr.payload.fromId, people[0].id);
  // persistido na "tabela"
  const stored = [...store.utterances.values()].find((u) => u.target_language === "tr");
  assert.equal(stored.translated_text, "[tr] Bom dia");
});

test("fallback de tradução: erro não trava a sala, marca failed e mantém o original", async () => {
  const store = fakeStore();
  const { room, people } = await seedRoom(store, [
    ["Amina", "pt", "pt"],
    ["Bekir", "tr", "tr"],
  ]);
  const boom = async () => {
    throw new Error("provider down");
  };
  const { translationDone } = await dispatchUtterance(
    { store, translate: boom },
    { room, sender: people[0], participants: people, text: "Olá" },
  );
  await translationDone;

  const done = store.broadcasts.find((b) => b.event === "utterance_translated");
  assert.equal(done.payload.failed, true);
  assert.equal(done.payload.translatedText, null);
  const stored = [...store.utterances.values()][0];
  assert.equal(stored.failed, true);
  assert.equal(stored.source_text, "Olá"); // original preservado
});

test("broadcast falhado não derruba o envio: linha fica gravada na mesma", async () => {
  const store = fakeStore();
  const { room, people } = await seedRoom(store, [
    ["Amina", "pt", "pt"],
    ["Bekir", "tr", "tr"],
  ]);
  store.broadcast = async () => {
    throw new Error("realtime down");
  };
  const { rows, translationDone } = await dispatchUtterance(
    { store, translate: mockTranslate },
    { room, sender: people[0], participants: people, text: "Olá" },
  );
  await translationDone;
  assert.equal(rows.length, 1);
  const stored = [...store.utterances.values()][0];
  assert.equal(stored.translated_text, "[tr] Olá"); // gravado apesar do Realtime em baixo
});

test("histórico: filtra pelo meu idioma e dedupe das minhas falas", async () => {
  const store = fakeStore();
  const { room, people } = await seedRoom(store, [
    ["Amina", "pt", "pt"],
    ["Bekir", "tr", "tr"],
    ["David", "en", "en"],
  ]);
  const d1 = await dispatchUtterance(
    { store, translate: mockTranslate },
    { room, sender: people[0], participants: people, text: "Bom dia" },
  );
  const d2 = await dispatchUtterance(
    { store, translate: mockTranslate },
    { room, sender: people[1], participants: people, text: "Merhaba" },
  );
  await Promise.all([d1.translationDone, d2.translationDone]);

  await withServer(makeApp({ store, translate: mockTranslate }), async (base) => {
    // Amina (pt): a sua fala aparece 1 vez (não 2) + a fala do Bekir traduzida para pt
    const res = await fetch(`${base}/api/rooms/SALA22/utterances?participantId=${people[0].id}`);
    const { messages } = await res.json();
    assert.equal(messages.length, 2);
    const mine = messages.filter((m) => m.mine);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].sourceText, "Bom dia");
    const theirs = messages.find((m) => !m.mine);
    assert.equal(theirs.targetLanguage, "pt");
    assert.equal(theirs.translatedText, "[pt] Merhaba");
  });
});

test("rota /utterance: mock chega a todos por idioma; remetente tem de pertencer à sala", async () => {
  const store = fakeStore();
  const { people } = await seedRoom(store, [
    ["Amina", "pt", "pt"],
    ["Bekir", "tr", "tr"],
  ]);
  await withServer(makeApp({ store, translate: mockTranslate }), async (base) => {
    const bad = await post(base, "/api/rooms/SALA22/utterance", { participantId: "intruso", text: "x" });
    assert.equal(bad.status, 403);

    const ok = await post(base, "/api/rooms/SALA22/utterance", { participantId: people[0].id, text: "Bom dia" });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.utteranceIds.length, 1); // só o alvo tr
  });
});

test("rota /speak: usa o idioma do falante no STT e distribui a transcrição; 503 sem STT", async () => {
  const store = fakeStore();
  const { people } = await seedRoom(store, [
    ["Amina", "pt", "pt"],
    ["Bekir", "tr", "tr"],
  ]);
  const sttCalls = [];
  const fakeTranscribe = async ({ language }) => {
    sttCalls.push(language);
    return "Bom dia doutor";
  };

  await withServer(makeApp({ store, translate: mockTranslate, transcribe: fakeTranscribe }), async (base) => {
    const form = new FormData();
    form.append("participantId", people[0].id);
    form.append("audio", new Blob([new Uint8Array(4000)], { type: "audio/webm" }), "s.webm");
    const res = await fetch(`${base}/api/rooms/SALA22/speak`, { method: "POST", body: form });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.text, "Bom dia doutor");
    assert.deepEqual(sttCalls, ["pt"]); // language do falante passado ao Whisper
    const news = store.broadcasts.filter((b) => b.event === "new_utterance");
    assert.equal(news.length, 1);
    assert.equal(news[0].payload.sourceText, "Bom dia doutor");
  });

  await withServer(makeApp({ store, translate: mockTranslate, transcribe: null }), async (base) => {
    const form = new FormData();
    form.append("participantId", people[0].id);
    form.append("audio", new Blob([new Uint8Array(10)]), "s.webm");
    const res = await fetch(`${base}/api/rooms/SALA22/speak`, { method: "POST", body: form });
    assert.equal(res.status, 503);
  });
});

test("encerrar: só o anfitrião; todos recebem room_closed", async () => {
  const store = fakeStore();
  const { people } = await seedRoom(store, [
    ["Amina", "pt", "pt"],
    ["Bekir", "tr", "tr"],
  ]);
  await withServer(makeApp({ store, translate: mockTranslate }), async (base) => {
    assert.equal((await post(base, "/api/rooms/SALA22/close", { participantId: people[1].id })).status, 403);
    assert.equal((await post(base, "/api/rooms/SALA22/close", { participantId: people[0].id })).status, 200);
    assert.equal(store.rooms.get("SALA22").status, "closed");
    assert.ok(store.broadcasts.some((b) => b.event === "room_closed"));
  });
});
