import { Link, useNavigate } from "react-router-dom";
import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";
import { lock } from "../lib/storage";

export function More() {
  const { lang } = useUiLang();
  const ui = UI[lang];
  const nav = useNavigate();

  const items = [
    { to: "/glossary", label: `📚 ${ui.glossary}` },
    { to: "/about", label: `ℹ️ ${ui.about}` },
  ];

  return (
    <>
      <h2>⚙️ {ui.settings}</h2>
      <ul className="list">
        {items.map((it) => (
          <li key={it.to}>
            <Link className="card" to={it.to}>
              {it.label}
            </Link>
          </li>
        ))}
        <li>
          <button
            className="btn wide"
            type="button"
            onClick={() => {
              lock();
              nav("/gate");
            }}
          >
            {ui.lock}
          </button>
        </li>
      </ul>
    </>
  );
}
