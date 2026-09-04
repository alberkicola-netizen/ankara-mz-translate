const base = process.argv[2] || "http://127.0.0.1:8793";
const checks = [
  ["GET meta", () => fetch(`${base}/api/rooms-meta`)],
  ["GET origin", () => fetch(`${base}/api/invite-origin`)],
  [
    "POST session",
    () =>
      fetch(`${base}/api/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lang: "pt" }),
      }),
  ],
];
for (const [name, fn] of checks) {
  try {
    const res = await fn();
    const text = await res.text();
    console.log(name, res.status, text.slice(0, 180));
  } catch (e) {
    console.log(name, "ERR", e instanceof Error ? e.message : e);
  }
}
