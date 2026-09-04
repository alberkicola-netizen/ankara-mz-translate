import { useState } from "react";
import { clearHistory, getHistory } from "../lib/storage";
import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";
import { speak } from "../lib/speech";
import { SESSION_LANG_FLAG, SESSION_LANG_NAME } from "../lib/session";

export function History() {
  const { lang } = useUiLang();
  const ui = UI[lang];
  const [items, setItems] = useState(getHistory());
  const [copied, setCopied] = useState<number | null>(null);

  return (
    <>
      <h2>🕘 {ui.history}</h2>
      {items.length === 0 ? <p className="muted">{ui.noHistory}</p> : null}
      {items.length > 0 ? (
        <button
          className="btn danger"
          type="button"
          onClick={() => {
            clearHistory();
            setItems([]);
          }}
          style={{ marginBottom: "0.8rem" }}
        >
          🗑️ {ui.clearHistory}
        </button>
      ) : null}
      {items.map((t, i) => (
        <section className="phrase" key={t.at + i}>
          <p className="muted">{new Date(t.at).toLocaleString()}</p>
          <p className="langtag">
            {SESSION_LANG_FLAG[t.from] ?? ""} {SESSION_LANG_NAME[t.from] ?? t.from} · {ui.original}
          </p>
          <p style={{ fontSize: "1.05rem" }}>{t.heard}</p>
          <p className="langtag">
            {SESSION_LANG_FLAG[t.to] ?? ""} {SESSION_LANG_NAME[t.to] ?? t.to} · {ui.translated}
          </p>
          <p style={{ fontSize: "1.2rem" }}>{t.translated}</p>
          <div className="actions">
            <button className="btn" type="button" onClick={() => speak(t.translated, t.to)}>
              🔊 {ui.speak}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(t.translated).then(() => {
                  setCopied(i);
                  setTimeout(() => setCopied(null), 1500);
                });
              }}
            >
              {copied === i ? ui.copied : `📋 ${ui.copyText}`}
            </button>
          </div>
        </section>
      ))}
    </>
  );
}
