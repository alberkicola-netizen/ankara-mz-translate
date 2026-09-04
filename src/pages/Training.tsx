import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";
import { isTrained, markTrained } from "../lib/storage";
import { useState } from "react";

export function Training() {
  const { lang } = useUiLang();
  const ui = UI[lang];
  const [done, setDone] = useState(isTrained());

  const blocks =
    lang === "pt"
      ? [
          "Isto não é o Google Translate. Use só cartões revistos.",
          "Instale no ecrã inicial. Depois funciona offline.",
          "Demo: Saudação → Dor → Preciso de enfermeira turca (o05) → Emergência.",
          "Toque no idioma para o telemóvel falar em direção ao doente.",
          "Proibido: fotos de processos, nomes de doentes, fala-rascunho para doses ou consentimento.",
          "Preceptoras: observadores não substituem staff licenciado.",
        ]
      : lang === "tr"
        ? [
            "Bu Google Translate değildir. Yalnızca gözden geçirilmiş kartları kullanın.",
            "Ana ekrana ekleyin; sonra çevrimdışı çalışır.",
            "Demo: Selamlama → Ağrı → Türk hemşire (o05) → Acil.",
            "Telefonun konuşması için dile dokunun.",
            "Yasak: dosya fotoğrafı, hasta adı, taslak konuşmayı doz veya onam için kullanmak.",
            "Preseptörler: gözlemciler yetkili personelin yerini almaz.",
          ]
        : [
            "This is not Google Translate. Use reviewed cards.",
            "Add to Home Screen; then it works offline.",
            "Demo: Greeting → Pain → I need a Turkish nurse (o05) → Emergency.",
            "Tap a language so the phone speaks toward the patient.",
            "Forbidden: photos of records, patient names, draft speech for doses or consent.",
            "Preceptors: observers do not replace licensed staff.",
          ];

  return (
    <>
      <h2>{ui.training}</h2>
      <p className="muted">Observers 30 min · Preceptors 15 min · See docs/pilot/TRAINING.md</p>
      <ol>
        {blocks.map((b) => (
          <li key={b} style={{ margin: "0.6rem 0" }}>
            {b}
          </li>
        ))}
      </ol>
      <button
        className="btn primary wide"
        type="button"
        onClick={() => {
          markTrained();
          setDone(true);
        }}
      >
        {ui.markTrained}
      </button>
      {done ? <p className="muted">OK</p> : null}
    </>
  );
}
