// E2E das salas contra serviços reais: node --env-file=.env scripts/e2e-rooms.mjs [porta]
// Requer o servidor já iniciado na mesma máquina com o mesmo .env.
const base = `http://localhost:${process.argv[2] || 8791}`;

function fail(step, detail) {
  console.error(`FALHOU [${step}]`, detail);
  process.exit(1);
}

const meta = await (await fetch(`${base}/api/rooms-meta`)).json();
console.log("meta:", JSON.stringify(meta));
if (!meta.enabled) fail("meta", "salas desativadas — .env não carregado?");

// 1. criar sala (anfitriã PT que quer receber PT)
let res = await fetch(`${base}/api/rooms`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ displayName: "Amina", sourceLanguage: "pt", targetLanguage: "pt" }),
});
if (!res.ok) fail("criar sala", `${res.status} ${await res.text()}`);
const room = await res.json();
console.log("sala criada:", room.roomId, room.publicUrl);

// 2. entrar (participante TR que quer receber TR)
res = await fetch(`${base}/api/rooms/${room.roomId}/join`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ displayName: "Bekir", sourceLanguage: "tr", targetLanguage: "tr" }),
});
if (!res.ok) fail("join", `${res.status} ${await res.text()}`);
const bekir = await res.json();
console.log("participante entrou:", bekir.participantId);

// 3. Amina fala em PT → deve gerar 1 linha TR
res = await fetch(`${base}/api/rooms/${room.roomId}/utterance`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ participantId: room.participantId, text: "Bom dia, como está a sua família?" }),
});
if (!res.ok) fail("utterance PT", `${res.status} ${await res.text()}`);
console.log("utterance PT enviada:", JSON.stringify(await res.json()));

// 4. Bekir fala em TR → deve gerar 1 linha PT
res = await fetch(`${base}/api/rooms/${room.roomId}/utterance`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ participantId: bekir.participantId, text: "Günaydın, toplantı saat kaçta başlıyor?" }),
});
if (!res.ok) fail("utterance TR", `${res.status} ${await res.text()}`);
console.log("utterance TR enviada");

// 5. esperar pelas traduções (o backend atualiza em segundo plano)
let done = false;
for (let i = 0; i < 30 && !done; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const hist = await (
    await fetch(`${base}/api/rooms/${room.roomId}/utterances?participantId=${bekir.participantId}`)
  ).json();
  const msgs = hist.messages ?? [];
  const incoming = msgs.find((m) => !m.mine);
  if (incoming && !incoming.pending) {
    done = true;
    console.log("\n=== RESULTADO (visão do Bekir, TR) ===");
    for (const m of msgs) {
      console.log(
        m.mine ? "[minha]" : "[recebida]",
        `${m.sourceLanguage}->${m.targetLanguage}`,
        "| original:", m.sourceText,
        "| traduzida:", m.translatedText,
        m.failed ? "(FALHOU)" : "",
      );
    }
    if (incoming.failed) fail("tradução", "flag failed=true — ver logs do servidor");
  } else {
    process.stdout.write(".");
  }
}
if (!done) fail("tradução", "timeout de 60s à espera da tradução");

// 6. encerrar
res = await fetch(`${base}/api/rooms/${room.roomId}/close`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ participantId: room.participantId }),
});
if (!res.ok) fail("close", `${res.status}`);
console.log("\nsala encerrada. E2E OK");
