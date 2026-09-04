import { useState } from "react";
import glossary from "../data/glossary.json";
import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";
import { normalize, speak } from "../lib/speech";

export function Glossary() {
  const { lang } = useUiLang();
  const ui = UI[lang];
  const [q, setQ] = useState("");

  const terms = glossary.terms.filter((t) => {
    if (!q.trim()) return true;
    const needle = normalize(q);
    return normalize(`${t.pt} ${t.tr} ${t.en}`).includes(needle);
  });

  return (
    <>
      <h2>📚 {ui.glossary}</h2>
      <input
        className="search"
        type="text"
        placeholder={ui.search}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <table className="gloss-table">
        <thead>
          <tr>
            <th>🇹🇷 Türkçe</th>
            <th>🇲🇿 Português</th>
            <th>🇬🇧 English</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {terms.map((t) => (
            <tr key={t.pt}>
              <td>{t.tr}</td>
              <td>{t.pt}</td>
              <td className="muted">{t.en}</td>
              <td>
                <button className="btn" type="button" onClick={() => speak(t.tr, "tr")} aria-label={`${ui.speak} TR`}>
                  🔊
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
