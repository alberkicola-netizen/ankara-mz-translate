import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";
import {
  SESSION_LANGS,
  SESSION_LANG_FLAG,
  SESSION_LANG_NAME,
  connectSession,
  createSession,
  loadCreds,
  saveCreds,
  type SessionConnection,
} from "../lib/session";
import type { SessionLang } from "../types";
import {
  fetchInviteOrigin,
  isPhoneBrowser,
  isTunnelHost,
  pcAppUrl,
  publicInviteUrl,
  type InviteOrigin,
} from "../lib/inviteUrl";
import { InviteShare } from "../components/InviteShare";
import { COHORT_PIN } from "../data/cohort";
import { getApi } from "../lib/net";
import { cloudSessionsEnabled } from "../lib/pairCloud";

export function SessionNew() {
  const { lang } = useUiLang();
  const ui = UI[lang];
  const nav = useNavigate();
  const [myLang, setMyLang] = useState<SessionLang>(lang);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [origin, setOrigin] = useState<InviteOrigin | null>(null);
  const connRef = useRef<SessionConnection | null>(null);

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
    return () => connRef.current?.close();
  }, [ui.connServerOff]);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const s = await createSession(myLang);
      saveCreds({ code: s.code, token: s.token, role: "a", myLang, peerLang: null });
      setCode(s.code);
      setLink(publicInviteUrl(`/join/${encodeURIComponent(s.code.toUpperCase())}?lang=${encodeURIComponent(myLang)}`));
      connRef.current = connectSession({
        code: s.code,
        token: s.token,
        onMessage: (msg) => {
          if (msg.type === "joined") {
            const creds = loadCreds(s.code);
            if (creds) saveCreds({ ...creds, peerLang: msg.lang });
            connRef.current?.close();
            nav(`/session/${s.code}`);
          }
        },
        onConnected: () => undefined,
        onDisconnected: () => undefined,
      });
    } catch {
      setError(ui.generateFailed);
    } finally {
      setBusy(false);
    }
  }

  if (!code) {
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

  return (
    <>
      <p className="muted">
        {SESSION_LANG_FLAG[myLang]} {SESSION_LANG_NAME[myLang]}
      </p>
      <InviteShare
        ui={ui}
        title={ui.sessionReady}
        hint={ui.scanQrHint}
        code={code}
        codeLabel={ui.sessionCode}
        link={link}
        origin={origin}
      />
      <p className="mic-label" style={{ textAlign: "center" }}>
        {ui.waitingPeer}
        <span className="waves" aria-hidden>
          <i /><i /><i /><i /><i />
        </span>
      </p>
    </>
  );
}
