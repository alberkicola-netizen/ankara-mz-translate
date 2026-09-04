import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { COHORT_PIN } from "../data/cohort";
import { setUnlocked } from "../lib/storage";
import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";
import { LangMenu } from "../components/LangMenu";

export function Gate() {
  const { lang } = useUiLang();
  const ui = UI[lang];
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [nextPath, setNextPath] = useState("/");
  const nav = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    const linkPin = params.get("pin");
    const nextRaw = params.get("next") || "/";
    const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";
    if (linkPin && linkPin.trim() === COHORT_PIN) {
      setUnlocked();
      nav(next, { replace: true });
    } else if (linkPin) {
      setErr(true);
      setShowPin(true);
    }
  }, [params, nav]);

  function openLogin(dest: string) {
    setNextPath(dest);
    setErr(false);
    setShowPin(true);
  }

  function tryUnlock() {
    if (pin.trim() === COHORT_PIN) {
      setUnlocked();
      nav(nextPath);
    } else setErr(true);
  }

  return (
    <div className="lp">
      <header className="lp-top">
        <div className="lp-brand">
          <span className="lp-mark tika">TİKA</span>
          <span className="lp-mark uni">ANKARA UNIVERSITY</span>
          <span className="lp-mark app">{ui.brandName}</span>
        </div>
        <div className="lp-actions">
          <LangMenu />
          <button className="btn primary lp-entrar" type="button" onClick={() => openLogin("/")}>
            {ui.login}
          </button>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-copy">
          <h1>
            <span className="line1">{ui.heroLine1}</span>
            <span className="line2">{ui.heroLine2}</span>
          </h1>
          <p className="lp-sub">{ui.heroSub}</p>
          <button className="btn primary lp-cta" type="button" onClick={() => openLogin("/live")}>
            <MicIcon /> {ui.startVoice}
          </button>
        </div>
        <div className="lp-hero-photo">
          <img
            src="/hero-care.jpg"
            alt=""
            width={720}
            height={540}
            loading="lazy"
            decoding="async"
            onError={(e) => {
              const wrap = e.currentTarget.closest(".lp-hero-photo");
              if (wrap instanceof HTMLElement) wrap.style.display = "none";
            }}
          />
        </div>
      </section>

      <section className="lp-features" aria-label={ui.startTranslation}>
        <article className="lp-card">
          <div className="lp-card-icon blue" aria-hidden>
            <PeopleIcon />
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
          <button className="btn lp-ghost" type="button" onClick={() => openLogin("/session/new")}>
            {ui.startConvo} →
          </button>
        </article>

        <article className="lp-card">
          <div className="lp-card-icon green" aria-hidden>
            <GroupIcon />
          </div>
          <h2>{ui.cardGroupTitle}</h2>
          <p>{ui.cardGroupText}</p>
          <div className="lp-graphic group" aria-hidden>
            <span className="avatar a">1</span>
            <span className="avatar b">2</span>
            <span className="avatar c">3</span>
            <span className="avatar d">4</span>
            <span className="plus">+</span>
          </div>
          <button className="btn lp-ghost" type="button" onClick={() => openLogin("/room/new")}>
            {ui.createRoomCta} →
          </button>
        </article>

        <article className="lp-card qr">
          <h2>{ui.cardQrTitle}</h2>
          <div className="lp-qr" aria-hidden>
            <QrMark />
          </div>
          <p>{ui.cardQrHint}</p>
          <Link className="btn lp-ghost" to="/join">
            <ScanIcon /> {ui.scanQr}
          </Link>
        </article>
      </section>

      <section className="lp-how" id="ajuda">
        <h2>{ui.howTitle}</h2>
        <ol className="lp-steps">
          <li>
            <span className="step-ico blue" aria-hidden>
              <MicIcon />
            </span>
            <strong>{ui.how1Title}</strong>
            <span>{ui.how1Text}</span>
          </li>
          <li className="arrow" aria-hidden>
            →
          </li>
          <li>
            <span className="step-ico purple" aria-hidden>
              <AiIcon />
            </span>
            <strong>{ui.how2Title}</strong>
            <span>{ui.how2Text}</span>
          </li>
          <li className="arrow" aria-hidden>
            →
          </li>
          <li>
            <span className="step-ico green" aria-hidden>
              <SpeakerIcon />
            </span>
            <strong>{ui.how3Title}</strong>
            <span>{ui.how3Text}</span>
          </li>
          <li className="arrow" aria-hidden>
            →
          </li>
          <li>
            <span className="step-ico orange" aria-hidden>
              <ChatIcon />
            </span>
            <strong>{ui.how4Title}</strong>
            <span>{ui.how4Text}</span>
          </li>
        </ol>
      </section>

      <section className="lp-trust">
        <div>
          <span className="trust-ico" aria-hidden>
            🔒
          </span>
          <div>
            <strong>{ui.trustSecure}</strong>
            <p>{ui.trustSecureText}</p>
          </div>
        </div>
        <div>
          <span className="trust-ico" aria-hidden>
            💚
          </span>
          <div>
            <strong>{ui.trustPeople}</strong>
            <p>{ui.trustPeopleText}</p>
          </div>
        </div>
        <div>
          <span className="trust-ico" aria-hidden>
            🌐
          </span>
          <div>
            <strong>{ui.trustAll}</strong>
            <p>{ui.trustAllText}</p>
          </div>
        </div>
      </section>

      <section className="lp-about" id="sobre">
        <h2>{ui.about}</h2>
        <p>{ui.aboutQuote}</p>
        <p className="muted">{ui.aboutList}</p>
      </section>

      <section className="lp-about" id="privacidade">
        <h2>{ui.footerPrivacy}</h2>
        <p>{ui.trustSecureText}</p>
        <p className="muted">{ui.draft}</p>
      </section>

      <section className="lp-about" id="contacto">
        <h2>{ui.footerContact}</h2>
        <p>
          TİKA · Ankara University · Moçambique — {ui.coopLine}
        </p>
      </section>

      <footer className="lp-foot">
        <p>{ui.footerCopy}</p>
        <nav>
          <a href="#sobre">{ui.footerAbout}</a>
          <a href="#privacidade">{ui.footerPrivacy}</a>
          <a href="#ajuda">{ui.footerHelp}</a>
          <a href="#contacto">{ui.footerContact}</a>
        </nav>
      </footer>

      {showPin ? (
        <div className="lp-modal" role="dialog" aria-modal="true" aria-labelledby="pin-title">
          <div className="lp-modal-box">
            <button className="lp-modal-x" type="button" onClick={() => setShowPin(false)} aria-label={ui.closeModal}>
              ×
            </button>
            <h2 id="pin-title">{ui.login}</h2>
            <p className="muted">{ui.pinHint}</p>
            <label htmlFor="pin">{ui.pin}</label>
            <input
              id="pin"
              type="password"
              autoComplete="off"
              autoFocus
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setErr(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") tryUnlock();
              }}
            />
            {err ? <p className="danger">{ui.badPin}</p> : null}
            <button className="btn primary wide" type="button" onClick={tryUnlock}>
              {ui.unlock}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="9" r="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M3 19c.6-3 3-5 6-5s5.4 2 6 5M14 14c2.2.2 4.2 1.5 5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function GroupIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="2.4" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="8" r="2.4" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12.5" r="2.4" stroke="currentColor" strokeWidth="2" />
      <path d="M4 19c.5-2.4 2.3-4 4.5-4M15.5 15c2.2 0 4 1.6 4.5 4M8.5 16.5c1 .6 2.2.9 3.5.9s2.5-.3 3.5-.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 8V5h3M16 5h3v3M20 16v3h-3M8 19H5v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="8" y="8" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 10v4h4l5 4V6L8 10H4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M17 9a4 4 0 0 1 0 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function AiIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M6.2 6.2l2 2M15.8 15.8l2 2M17.8 6.2l-2 2M8.2 15.8l-2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 6h10a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H10l-4 3v-3H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function QrMark() {
  return (
    <svg viewBox="0 0 88 88" width="132" height="132" aria-hidden>
      <rect width="88" height="88" rx="8" fill="#fff" stroke="#dbe4f0" />
      {[
        [6, 6],
        [54, 6],
        [6, 54],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width="28" height="28" rx="3" fill="#002855" />
          <rect x={x + 6} y={y + 6} width="16" height="16" fill="#fff" />
          <rect x={x + 10} y={y + 10} width="8" height="8" fill="#002855" />
        </g>
      ))}
      <rect x="42" y="42" width="8" height="8" fill="#002855" />
      <rect x="54" y="42" width="8" height="8" fill="#002855" />
      <rect x="70" y="42" width="8" height="8" fill="#002855" />
      <rect x="42" y="54" width="8" height="8" fill="#002855" />
      <rect x="42" y="70" width="8" height="8" fill="#002855" />
      <rect x="58" y="58" width="12" height="8" fill="#002855" />
      <rect x="74" y="62" width="8" height="16" fill="#002855" />
      <rect x="54" y="74" width="16" height="8" fill="#002855" />
    </svg>
  );
}
