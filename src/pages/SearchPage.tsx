import { useMemo, useState } from "react";
import { PHRASES } from "../data/phrases";
import { PhraseCard } from "../components/PhraseCard";
import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";
import { normalize } from "../lib/speech";

export function SearchPage() {
  const { lang } = useUiLang();
  const ui = UI[lang];
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const n = normalize(q);
    if (n.length < 2) return [];
    return PHRASES.filter((p) => normalize(`${p.pt} ${p.tr} ${p.en} ${p.id}`).includes(n)).slice(0, 40);
  }, [q]);

  return (
    <>
      <input className="search" placeholder={ui.search} value={q} onChange={(e) => setQ(e.target.value)} />
      {hits.map((p) => (
        <PhraseCard key={p.id} phrase={p} />
      ))}
    </>
  );
}
