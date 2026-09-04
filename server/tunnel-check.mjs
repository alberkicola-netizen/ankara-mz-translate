// One-off check: full session flow through the public Cloudflare tunnel.
import { WebSocket } from "ws";

const base = process.argv[2];
if (!base) throw new Error("usage: node tunnel-check.mjs https://host");

const j = (r) => r.json();
const post = (url, body) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(j);

const { code, token } = await post(`${base}/api/session`, { lang: "pt" });
console.log("created", code);
const wsBase = base.replace("https:", "wss:");

const a = new WebSocket(`${wsBase}/ws?code=${code}&token=${token}`);
await new Promise((res, rej) => { a.once("open", res); a.once("error", rej); });
console.log("creator ws open");

const { token: bToken } = await post(`${base}/api/session/${code}/join`, { lang: "tr" });
const b = new WebSocket(`${wsBase}/ws?code=${code}&token=${bToken}`);
await new Promise((res, rej) => { b.once("open", res); b.once("error", rej); });
console.log("guest ws open");

const got = new Promise((res) => {
  b.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === "utterance") res(m);
  });
});
setTimeout(() => a.send(JSON.stringify({ type: "utterance", original: "Olá", translated: "Merhaba" })), 300);
const msg = await got;
console.log("relayed through tunnel:", msg.translated);
a.send(JSON.stringify({ type: "end" }));
setTimeout(() => process.exit(0), 500);
