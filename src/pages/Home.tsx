import { Link } from "react-router-dom";
import { CATEGORIES, PHRASES } from "../data/phrases";
import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";
import { PhoneAccess } from "../components/PhoneAccess";
import { isLoopbackHost } from "../lib/inviteUrl";

export function Home() {
  const { lang } = useUiLang();
  const ui = UI[lang];
  const showPhoneBox = isLoopbackHost(window.location.hostname);

  return (
    <div className="home-dash">
      <section className="home-hero">
        <h1>
          <span className="line1">{ui.heroLine1}</span>
          <span className="line2">{ui.heroLine2}</span>
        </h1>
        <p className="muted">{ui.heroSub}</p>
        <Link className="btn primary lp-cta" to="/live">
          🎙️ {ui.startVoice}
        </Link>
      </section>

      {showPhoneBox ? <PhoneAccess /> : null}

      <section className="lp-features in-app" aria-label={ui.startTranslation}>
        <article className="lp-card">
          <div className="lp-card-icon blue" aria-hidden>
            👥
          </div>
          <h2>{ui.cardBiTitle}</h2>
          <p>{ui.cardBiText}</p>
          <div className="lp-graphic bi" aria-hidden>
            <span className="avatar a">A</span>
            <span className="wave blue" />
            <span className="mid">A</span>
            <span className="wave green" />
            <span className="avatar b">B</span>
          </div>
          <Link className="btn lp-ghost" to="/session/new">
            {ui.startConvo} →
          </Link>
        </article>

        <article className="lp-card qr">
          <h2>{ui.cardQrTitle}</h2>
          <p>{ui.cardQrHint}</p>
          <p className="muted">{ui.codeExplainer}</p>
          <Link className="btn lp-ghost" to="/join">
            {ui.scanQr} →
          </Link>
        </article>
      </section>

      <h2 className="home-section">{ui.approvedPhrases}</h2>
      <p className="banner">{ui.starter}</p>
      <p className="muted">
        {PHRASES.length} {ui.count}
      </p>
      <div className="grid">
        {CATEGORIES.map((c) => (
          <Link key={c.id} className="card" to={`/category/${c.id}`}>
            <h2>{c[lang]}</h2>
            <p className="muted">{PHRASES.filter((p) => p.category === c.id).length}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
