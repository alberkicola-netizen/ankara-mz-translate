import { NavLink, Outlet } from "react-router-dom";
import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";
import { LangMenu } from "./LangMenu";

export function Layout() {
  const { lang } = useUiLang();
  const ui = UI[lang];

  const side = [
    { to: "/", label: ui.home, icon: "🏠", end: true },
    { to: "/session/new", label: ui.createSession, icon: "📱" },
    { to: "/room/new", label: ui.createRoom, icon: "👥" },
    { to: "/join", label: ui.joinTitle, icon: "🔢" },
    { to: "/live", label: ui.liveNav, icon: "🎙️" },
    { to: "/speech", label: ui.speech, icon: "🗣️" },
    { to: "/search", label: ui.searchNav, icon: "🔍" },
    { to: "/favorites", label: ui.favorites, icon: "⭐" },
    { to: "/glossary", label: ui.glossary, icon: "📚" },
    { to: "/history", label: ui.history, icon: "🕘" },
    { to: "/invite", label: ui.invite, icon: "🔗" },
    { to: "/about", label: ui.about, icon: "ℹ️" },
    { to: "/more", label: ui.settings, icon: "⚙️" },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="tika">TİKA</span>
          <span className="uni">Ankara University</span>
          <span className="uni">{ui.brandName}</span>
        </div>
        {side.map((s) => (
          <NavLink key={s.to} to={s.to} end={s.end} className="side-link">
            <span aria-hidden>{s.icon}</span> {s.label}
          </NavLink>
        ))}
        <div className="side-foot">
          TİKA × Ankara University × Moçambique
          <br />
          🇹🇷 → 🌍 → 🇲🇿
        </div>
      </aside>

      <div className="content">
        <header className="top">
          <div className="lp-brand compact">
            <span className="lp-mark tika">TİKA</span>
            <span className="lp-mark uni">ANKARA UNIVERSITY</span>
            <span className="lp-mark app">{ui.brandName}</span>
          </div>
          <span className="conn">
            <span className="dot" />
            {ui.connStable}
          </span>
          <LangMenu />
          <NavLink to="/more" className="iconbtn" aria-label={ui.settings}>
            ⚙️
          </NavLink>
        </header>
        <main className="wrap">
          <Outlet />
        </main>
      </div>

      <nav className="nav">
        <NavLink to="/" end>
          🏠 {ui.home}
        </NavLink>
        <NavLink to="/live">🎙️ {ui.live}</NavLink>
        <NavLink to="/search">🔍 {ui.searchNav}</NavLink>
        <NavLink to="/glossary">📚 {ui.glossary.split(" ")[0]}</NavLink>
        <NavLink to="/more">⚙️ ···</NavLink>
      </nav>
    </div>
  );
}
