import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { WebSocket } from "ws";
import { attachWs, createApp } from "./server.mjs";

let server;
let base;
let wsBase;

test.before(async () => {
  server = createServer(createApp());
  attachWs(server);
  await new Promise((r) => server.listen(0, r));
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;
  wsBase = `ws://127.0.0.1:${port}`;
});

test.after(() => server.close());

/** WS client that queues incoming messages and lets tests await a given type. */
function client(code, token) {
  const ws = new WebSocket(`${wsBase}/ws?code=${code}&token=${token}`);
  const queue = [];
  const waiters = [];
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    const w = waiters.findIndex((x) => x.type === msg.type);
    if (w >= 0) waiters.splice(w, 1)[0].resolve(msg);
    else queue.push(msg);
  });
  return {
    ws,
    next(type, timeoutMs = 3000) {
      const q = queue.findIndex((m) => m.type === type);
      if (q >= 0) return Promise.resolve(queue.splice(q, 1)[0]);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timeout waiting for "${type}"`)), timeoutMs);
        waiters.push({ type, resolve: (m) => { clearTimeout(t); resolve(m); } });
      });
    },
    send(msg) {
      ws.send(JSON.stringify(msg));
    },
    close() {
      ws.close();
    },
  };
}

async function createSession(lang = "pt") {
  const res = await fetch(`${base}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lang }),
  });
  assert.equal(res.status, 200);
  return res.json();
}

test("create and read a session", async () => {
  const { code, token } = await createSession("pt");
  assert.match(code, /^[A-Z2-9]{6}$/);
  assert.ok(token.length >= 32);
  const res = await fetch(`${base}/api/session/${code}`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { creatorLang: "pt", status: "waiting" });
});

test("unknown session returns 404 and bad lang 400", async () => {
  assert.equal((await fetch(`${base}/api/session/XXXXXX`)).status, 404);
  const bad = await fetch(`${base}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lang: "zz" }),
  });
  assert.equal(bad.status, 400);
});

test("join notifies creator, relays both directions, rejects a third participant", async () => {
  const { code, token } = await createSession("pt");
  const a = client(code, token);
  assert.equal((await a.next("hello")).role, "a");

  const joinRes = await fetch(`${base}/api/session/${code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lang: "tr" }),
  });
  assert.equal(joinRes.status, 200);
  const { token: bToken, creatorLang } = await joinRes.json();
  assert.equal(creatorLang, "pt");
  assert.equal((await a.next("joined")).lang, "tr");

  const b = client(code, bToken);
  const helloB = await b.next("hello");
  assert.equal(helloB.role, "b");
  assert.equal(helloB.peerLang, "pt");
  assert.equal(helloB.peerOnline, true);
  await a.next("peer"); // b came online

  // PT -> TR
  a.send({ type: "utterance", original: "Olá", translated: "Merhaba" });
  const gotB = await b.next("utterance");
  assert.equal(gotB.translated, "Merhaba");

  // TR -> PT (and interim captions)
  b.send({ type: "interim", text: "Nasıl" });
  assert.equal((await a.next("interim")).text, "Nasıl");
  b.send({ type: "utterance", original: "Nasılsınız", translated: "Como está" });
  assert.equal((await a.next("utterance")).translated, "Como está");

  // third participant rejected
  const third = await fetch(`${base}/api/session/${code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lang: "en" }),
  });
  assert.equal(third.status, 409);

  a.close();
  b.close();
});

test("reconnection with the same token works", async () => {
  const { code, token } = await createSession("en");
  const joinRes = await fetch(`${base}/api/session/${code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lang: "fr" }),
  });
  const { token: bToken } = await joinRes.json();

  const b1 = client(code, bToken);
  await b1.next("hello");
  b1.close();

  const b2 = client(code, bToken);
  const hello = await b2.next("hello");
  assert.equal(hello.role, "b");
  b2.close();
});

test("invalid token is refused", async () => {
  const { code } = await createSession("tr");
  const bad = client(code, "wrong-token");
  const msg = await bad.next("error");
  assert.equal(msg.error, "invalid session");
});

test("end deletes the session for everyone", async () => {
  const { code, token } = await createSession("pt");
  const joinRes = await fetch(`${base}/api/session/${code}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lang: "tr" }),
  });
  const { token: bToken } = await joinRes.json();
  const a = client(code, token);
  await a.next("hello");
  const b = client(code, bToken);
  await b.next("hello");

  a.send({ type: "end" });
  await b.next("end");
  assert.equal((await fetch(`${base}/api/session/${code}`)).status, 404);
  a.close();
  b.close();
});
