// Smoke do /api/translate (IA real): node scripts/smoke-translate.mjs [porta]
const base = `http://localhost:${process.argv[2] || 8792}`;

const cases = [
  ["pt", "tr", "A consulta é amanhã às nove horas."],
  ["tr", "pt", "İlacı günde iki kez yemeklerden sonra alın."],
  ["pt", "en", "Onde dói mais?"],
];

for (const [from, to, text] of cases) {
  const res = await fetch(`${base}/api/translate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, from, to }),
  });
  const body = await res.json().catch(() => null);
  console.log(`${from}->${to} [${res.status}]`, text, "=>", body?.text ?? body);
  if (!res.ok) process.exit(1);
}
console.log("translate OK");
