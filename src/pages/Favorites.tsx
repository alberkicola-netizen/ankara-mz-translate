import { PHRASES } from "../data/phrases";
import { PhraseCard } from "../components/PhraseCard";
import { getFavorites } from "../lib/storage";
import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";

export function Favorites() {
  const { lang } = useUiLang();
  const ids = getFavorites();
  const list = PHRASES.filter((p) => ids.includes(p.id));
  const ui = UI[lang];

  return (
    <>
      <h2>{ui.favorites}</h2>
      {list.length === 0 ? <p className="muted">—</p> : list.map((p) => <PhraseCard key={p.id} phrase={p} />)}
    </>
  );
}
