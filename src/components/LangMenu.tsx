import { useEffect, useRef, useState } from "react";
import type { Lang } from "../types";
import { useUiLang } from "../lib/ui-lang";
import { UI } from "../lib/i18n";

const LABELS: Record<Lang, string> = {
  pt: "Português",
  tr: "Türkçe",
  en: "English",
};

export function LangMenu({ variant = "light" }: { variant?: "light" | "dark" }) {
  const { lang, setLang } = useUiLang();
  const ui = UI[lang];
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className={`lp-lang ${variant}`} ref={box}>
      <button
        type="button"
        className="lp-lang-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ui.uiLang}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>🌐</span> {LABELS[lang]}
        <span className="lp-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <ul className="lp-lang-menu" role="listbox">
          {(["pt", "tr", "en"] as const).map((l) => (
            <li key={l}>
              <button
                type="button"
                role="option"
                aria-selected={lang === l}
                className={lang === l ? "on" : ""}
                onClick={() => {
                  setLang(l);
                  setOpen(false);
                }}
              >
                {LABELS[l]}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
