import { Link } from "react-router-dom";
import type { Phrase } from "../types";
import { speak } from "../lib/speech";
import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";
import { getFavorites, toggleFavorite } from "../lib/storage";
import { useState } from "react";

export function PhraseCard({ phrase }: { phrase: Phrase }) {
  const { lang } = useUiLang();
  const ui = UI[lang];
  const [fav, setFav] = useState(() => getFavorites().includes(phrase.id));

  return (
    <article className="phrase">
      <div className="muted">
        {phrase.id}
        {phrase.critical ? <span className="badge">{ui.critical}</span> : null}
      </div>
      {(["pt", "tr", "en"] as const).map((l) => (
        <div className="row" key={l}>
          <div className="langtag">{l.toUpperCase()}</div>
          <p>{phrase[l]}</p>
          <button type="button" className="btn" onClick={() => speak(phrase[l], l)}>
            {ui.speak} {l.toUpperCase()}
          </button>
        </div>
      ))}
      <div className="actions">
        <button
          type="button"
          className="btn"
          onClick={() => setFav(toggleFavorite(phrase.id).includes(phrase.id))}
        >
          {fav ? "★" : "☆"} {ui.star}
        </button>
        <Link className="btn" to={`/phrase/${phrase.id}`}>
          →
        </Link>
      </div>
    </article>
  );
}
