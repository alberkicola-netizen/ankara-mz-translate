import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";

export function About() {
  const { lang } = useUiLang();
  const ui = UI[lang];

  return (
    <>
      <h2>{ui.about}</h2>
      <p>{ui.aboutQuote}</p>
      <ul className="list">
        <li className="card">{ui.aboutTika}</li>
        <li className="card">{ui.aboutUni}</li>
        <li className="card">{ui.aboutMz}</li>
      </ul>
      <h3>{ui.aboutSupports}</h3>
      <p className="muted">{ui.aboutList}</p>
    </>
  );
}
