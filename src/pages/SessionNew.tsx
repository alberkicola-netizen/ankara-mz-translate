import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";
import {
  SESSION_LANGS,
  SESSION_LANG_FLAG,
  SESSION_LANG_NAME,
  createSession,
  saveCreds,
} from "../lib/session";
import type { SessionLang } from "../types";
import { fetchInviteOrigin, isPhoneBrowser, isTunnelHost, pcAppUrl, type InviteOrigin } from "../lib/inviteUrl";
import { COHORT_PIN } from "../data/cohort";
import { getApi } from "../lib/net";
import { cloudSessionsEnabled } from "../lib/pairCloud";

export function SessionNew() {
  const { lang } = useUiLang();
  const ui = UI[lang];
  const nav = useNavigate();
  const [myLang, setMyLang] = useState<SessionLang>(lang);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState<InviteOrigin | null>(null);

  useEffect(() => {
    if (isTunnelHost(window.location.hostname) && !isPhoneBrowser()) {
      const next = encodeURIComponent("/session/new");
      window.location.replace(`${pcAppUrl("/gate")}?pin=${encodeURIComponent(COHORT_PIN)}&next=${next}`);
      return;
    }
    void fetchInviteOrigin().then(setOrigin);
    if (!cloudSessionsEnabled()) {
      void getApi("/api/rooms-meta")
        .then((r) => {
          if (!r.ok) setError(ui.connServerOff);
        })
        .catch(() => setError(ui.connServerOff));
    }
  }, [ui.connServerOff]);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const s = await createSession(myLang);
      saveCreds({ code: s.code, token: s.token, role: "a", myLang, peerLang: null });
      nav(`/session/${s.code}`);
    } catch {
      setError(ui.generateFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>🔗 {ui.createSession}</h2>
      <p className="muted">{ui.inviteSessionHow}</p>
      <label>{ui.chooseYourLang}</label>
      <div className="langpick">
        {SESSION_LANGS.map((l) => (
          <button
            key={l}
            type="button"
            className={myLang === l ? "pick on" : "pick"}
            onClick={() => setMyLang(l)}
          >
            <span className="flag">{SESSION_LANG_FLAG[l]}</span> {SESSION_LANG_NAME[l]}
          </button>
        ))}
      </div>
      {origin && !origin.https ? <p className="banner">{origin.loopback ? ui.qrLocalhostWarn : ui.qrLanHint}</p> : null}
      {error ? (
        <>
          <p className="warn">{error}</p>
          <a
            className="btn wide"
            href={`${pcAppUrl("/gate")}?pin=${encodeURIComponent(COHORT_PIN)}&next=${encodeURIComponent("/session/new")}`}
          >
            {ui.openOnThisPc}
          </a>
        </>
      ) : null}
      <button className="btn primary wide" type="button" disabled={busy} onClick={() => void generate()}>
        {busy ? <span className="spinner" /> : `📱 ${ui.generateQr}`}
      </button>
    </>
  );
}
