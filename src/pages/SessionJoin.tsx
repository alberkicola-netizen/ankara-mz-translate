import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";
import {
  SESSION_LANGS,
  SESSION_LANG_FLAG,
  SESSION_LANG_NAME,
  getSession,
  isSessionCode,
  joinSession,
  saveCreds,
} from "../lib/session";
import type { SessionLang } from "../types";

type State =
  | { kind: "code" }
  | { kind: "loading" }
  | { kind: "gone" }
  | { kind: "offline" }
  | { kind: "full" }
  | { kind: "ready"; creatorLang: SessionLang };

export function SessionJoin() {
  const { lang, setLang } = useUiLang();
  const ui = UI[lang];
  const nav = useNavigate();
  const { code: raw = "" } = useParams();
  const [params] = useSearchParams();
  const code = raw.trim().toUpperCase();
  const hintLang = (SESSION_LANGS.includes(params.get("lang") as SessionLang) ? params.get("lang") : lang) as SessionLang;
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<State>(code ? { kind: "loading" } : { kind: "code" });
  const [myLang, setMyLang] = useState<SessionLang>(lang);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!code) {
      setState({ kind: "code" });
      return;
    }
    const optimistic = isSessionCode(code);
    if (optimistic) setState({ kind: "ready", creatorLang: hintLang });
    else setState({ kind: "loading" });
    getSession(code)
      .then((s) => {
        if (s?.status === "ended") setState({ kind: "gone" });
        else if (s?.status === "active") setState({ kind: "full" });
        else if (s) setState({ kind: "ready", creatorLang: s.creatorLang || hintLang });
        else if (!optimistic) setState({ kind: "gone" });
      })
      .catch(() => {
        if (!optimistic) setState({ kind: "offline" });
      });
  }, [code, retry, hintLang]);

  async function enter(creatorLang: SessionLang) {
    setBusy(true);
    try {
      const res = await joinSession(code, myLang);
      if (res === "gone") return setState({ kind: "gone" });
      if (res === "full") return setState({ kind: "full" });
      saveCreds({ code, token: res.token, role: "b", myLang, peerLang: creatorLang });
      nav(`/session/${code}`);
    } catch {
      setState({ kind: "offline" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="landing">
      <header className="landing-top">
        <span className="tika">TİKA</span>
        <span className="uni">| Ankara University</span>
        <span className="spacer" />
        <div className="lang">
          {(["pt", "tr", "en"] as const).map((l) => (
            <button key={l} className={lang === l ? "on" : ""} type="button" onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <section className="hero" style={{ flex: 1 }}>
        <h1>{ui.joinTitle}</h1>
        <div className="box">
          {state.kind === "code" ? (
            <>
              <p className="muted">{ui.codeExplainer}</p>
              <label htmlFor="sess-code">{ui.sessionCode}</label>
              <input
                id="sess-code"
                type="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={8}
                value={typed}
                onChange={(e) => setTyped(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && typed.length >= 4) nav(`/join/${typed}`);
                }}
              />
              <button
                className="btn primary wide"
                type="button"
                disabled={typed.length < 4}
                onClick={() => nav(`/join/${typed}`)}
                style={{ marginTop: "0.8rem" }}
              >
                {ui.enterSession}
              </button>
            </>
          ) : null}

          {state.kind === "loading" ? (
            <p className="muted">
              <span className="spinner" /> …
            </p>
          ) : null}

          {state.kind === "gone" ? (
            <>
              <p className="warn">{ui.sessionGone}</p>
              <Link className="btn wide" to="/join" style={{ display: "block", textAlign: "center" }}>
                {ui.typeCodeHint}
              </Link>
            </>
          ) : null}

          {state.kind === "offline" ? (
            <>
              <p className="warn">{ui.sessionOffline}</p>
              <button className="btn primary wide" type="button" onClick={() => setRetry((n) => n + 1)}>
                {ui.enterSession}
              </button>
            </>
          ) : null}

          {state.kind === "full" ? <p className="warn">{ui.sessionFull}</p> : null}

          {state.kind === "ready" ? (
            <>
              <p className="muted">{ui.joiningInfo}</p>
              <p style={{ fontSize: "1.05rem", margin: "0.3rem 0 0.8rem" }}>
                {ui.otherParticipant}:{" "}
                <strong>
                  {SESSION_LANG_FLAG[state.creatorLang]} {SESSION_LANG_NAME[state.creatorLang]}
                </strong>
              </p>
              <label>{ui.whichLang}</label>
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
              <button
                className="btn primary wide"
                type="button"
                disabled={busy}
                onClick={() => void enter(state.creatorLang)}
                style={{ marginTop: "0.8rem" }}
              >
                {busy ? <span className="spinner" /> : ui.enterSession}
              </button>
            </>
          ) : null}
        </div>
      </section>

      <footer className="landing-foot">TİKA • Ankara Üniversitesi • Moçambique</footer>
    </div>
  );
}
