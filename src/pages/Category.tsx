import { useParams } from "react-router-dom";
import { CATEGORIES, PHRASES } from "../data/phrases";
import { PhraseCard } from "../components/PhraseCard";
import { useUiLang } from "../lib/ui-lang";

export function Category() {
  const { id } = useParams();
  const { lang } = useUiLang();
  const cat = CATEGORIES.find((c) => c.id === id);
  const list = PHRASES.filter((p) => p.category === id);

  return (
    <>
      <h2>{cat ? cat[lang] : id}</h2>
      {list.map((p) => (
        <PhraseCard key={p.id} phrase={p} />
      ))}
    </>
  );
}
