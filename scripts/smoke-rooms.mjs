// Smoke HTTP das salas (corre contra um servidor já iniciado): node scripts/smoke-rooms.mjs [porta]
const base = `http://localhost:${process.argv[2] || 8790}`;

const meta = await fetch(`${base}/api/rooms-meta`);
console.log("/api/rooms-meta", meta.status, await meta.text());

const origin = await fetch(`${base}/api/invite-origin`);
console.log("/api/invite-origin", origin.status, await origin.text());

const create = await fetch(`${base}/api/rooms`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ displayName: "Smoke", sourceLanguage: "pt", targetLanguage: "tr" }),
});
console.log("/api/rooms POST", create.status, await create.text());

for (const p of ["/?room=ABC234", "/join-room/ABC234", "/room/ABC234"]) {
  const res = await fetch(`${base}${p}`);
  const html = await res.text();
  console.log(p, res.status, html.includes('<div id="root">') ? "serves SPA index.html" : "UNEXPECTED BODY");
}
