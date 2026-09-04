import { useRef, useState } from "react";
import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";
import { getRecognizer, speak, STT_LANG, stopSpeak, unlockSpeech } from "../lib/speech";
import { machineTranslate } from "../lib/translate";
import { addHistory } from "../lib/storage";
import { classifyNetworkError } from "../lib/net";
import type { SessionLang } from "../types";
import { SESSION_LANGS, SESSION_LANG_FLAG, SESSION_LANG_NAME } from "../lib/session";

type Turn = {
  heard: string;
  translated: string;
  from: SessionLang;
  to: SessionLang;
  match: number;
};

type Phase = "idle" | "listening" | "translating" | "done";

function QualityLed({ match, ui }: { match: number; ui: (typeof UI)[keyof typeof UI] }) {
  const cls = match >= 0.85 ? "g" : match >= 0.5 ? "y" : "r";
  const label = match >= 0.85 ? ui.qExcellent : match >= 0.5 ? ui.qGood : ui.qReview;
  return (
    <span className="q">
      <span className={`led ${cls}`} /> {label}
    </span>
  );
}

export function Live() {
  const { lang } = useUiLang();
  const ui = UI[lang];
  const [from, setFrom] = useState<SessionLang>("tr");
  const [to, setTo] = useState<SessionLang>("pt");
  const [phase, setPhase] = useState<Phase>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [copied, setCopied] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const recRef = useRef<ReturnType<typeof getRecognizer>>(null);

  const latest = turns[0];

  async function handleFinal(text: string) {
    if (!text.trim()) return;
    setPhase("translating");
    setError("");
    try {
      const result = await machineTranslate(text, from, to);
      const turn: Turn = { heard: text, translated: result.text, from, to, match: result.match };
      setTurns((prev) => [turn, ...prev]);
      addHistory({ heard: text, translated: result.text, from, to, at: new Date().toISOString() });
      if (autoSpeak) speak(result.text, to);
      setPhase("done");
    } catch (e) {
      setError(classifyNetworkError(e, { ...ui, generateFailed: ui.translateFail }));
      setPhase("idle");
    } finally {
      setInterim("");
    }
  }

  function start() {
    stopSpeak();
    unlockSpeech();
    setError("");
    const rec = getRecognizer();
    if (!rec) {
      setError("Speech recognition is not available in this browser. Use Chrome on Android.");
      return;
    }
    rec.lang = STT_LANG[from];
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (interimText) setInterim(interimText);
      if (finalText) void handleFinal(finalText);
    };
    rec.onerror = (ev) => {
      if (ev.error === "network") setError(ui.typeIfMicFails);
      else if (ev.error !== "no-speech" && ev.error !== "aborted") setError(ev.error);
      setPhase("idle");
    };
    rec.onend = () => setPhase((p) => (p === "listening" ? "idle" : p));
    recRef.current = rec;
    rec.start();
    setPhase("listening");
  }

  function stop() {
    recRef.current?.stop();
    setPhase("idle");
  }

  function swap() {
    setFrom(to);
    setTo(from);
  }

  function copyTurn(t: Turn, i: number) {
    void navigator.clipboard.writeText(t.translated).then(() => {
      setCopied(i);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const listening = phase === "listening";

  return (
    <>
      <div className="banner">{ui.draft}</div>

      <div className="live-langs">
        <div className="langcard">
          <div className="tag">{ui.from}</div>
          <select value={from} onChange={(e) => setFrom(e.target.value as SessionLang)} aria-label={ui.from}>
            {SESSION_LANGS.map((l) => (
              <option key={l} value={l}>
                {SESSION_LANG_FLAG[l]} {SESSION_LANG_NAME[l]}
              </option>
            ))}
          </select>
        </div>
        <button className="swap" type="button" onClick={swap} aria-label="⇄">
          ⇄
        </button>
        <div className="langcard">
          <div className="tag">{ui.to}</div>
          <select value={to} onChange={(e) => setTo(e.target.value as SessionLang)} aria-label={ui.to}>
            {SESSION_LANGS.map((l) => (
              <option key={l} value={l}>
                {SESSION_LANG_FLAG[l]} {SESSION_LANG_NAME[l]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="muted">{ui.noCodeNeeded}</p>
      <div className="mic-zone">
        <button
          className={listening ? "micbtn listening" : "micbtn"}
          type="button"
          onClick={listening ? stop : start}
          aria-label={listening ? ui.stop : ui.tapToSpeak}
        >
          🎙️
        </button>
        <p className="mic-label">
          {phase === "idle" ? ui.tapToSpeak : null}
          {phase === "listening" ? (
            <>
              {ui.listening}
              <span className="waves" aria-hidden>
                <i /><i /><i /><i /><i />
              </span>
            </>
          ) : null}
          {phase === "translating" ? (
            <>
              {ui.translating}
              <span className="spinner" aria-hidden />
            </>
          ) : null}
          {phase === "done" ? <>✓ {ui.doneTranslation}</> : null}
        </p>
      </div>

      {error ? <p className="warn">{error}</p> : null}
      <label htmlFor="live-type">{ui.typeIfMicFails}</label>
      <textarea
        id="live-type"
        rows={2}
        placeholder={ui.typePlaceholder}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
      />
      <button
        className="btn primary wide"
        type="button"
        disabled={!typed.trim()}
        onClick={() => {
          unlockSpeech();
          const text = typed.trim();
          setTyped("");
          void handleFinal(text);
        }}
      >
        🔊 {ui.sendText}
      </button>

      <div className="split">
        <div className="pane source">
          <div className="head">
            {SESSION_LANG_FLAG[from]} {SESSION_LANG_NAME[from]}
          </div>
          {interim ? (
            <p className="text interim">{interim}…</p>
          ) : (
            <p className="text">{latest && latest.from === from ? latest.heard : ""}</p>
          )}
        </div>
        <div className="pane target">
          <div className="head">
            {SESSION_LANG_FLAG[to]} {SESSION_LANG_NAME[to]}
          </div>
          <p className="text">{latest && latest.to === to ? latest.translated : ""}</p>
        </div>
      </div>

      <div className="statuspanel">
        <span>
          <strong>{ui.quality}:</strong>
        </span>
        {latest ? <QualityLed match={latest.match} ui={ui} /> : <span className="muted">—</span>}
        <span>
          {ui.connection}: 🟢 {ui.connStable}
        </span>
        <span>🤖 {ui.aiActive}</span>
        <label style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center", margin: 0 }}>
          <input
            type="checkbox"
            style={{ width: "auto" }}
            checked={autoSpeak}
            onChange={(e) => setAutoSpeak(e.target.checked)}
          />
          {ui.autoSpeak}
        </label>
      </div>

      {turns.map((t, i) => (
        <section className="phrase" key={turns.length - i}>
          <p className="langtag">
            {SESSION_LANG_FLAG[t.from]} {SESSION_LANG_NAME[t.from]} · {ui.original}
          </p>
          <p style={{ fontSize: "1.05rem" }}>{t.heard}</p>
          <p className="langtag">
            {SESSION_LANG_FLAG[t.to]} {SESSION_LANG_NAME[t.to]} · {ui.translated}
          </p>
          <p style={{ fontSize: "1.3rem" }}>{t.translated}</p>
          <div className="actions">
            <button
              className="btn primary"
              type="button"
              onClick={() => {
                unlockSpeech();
                speak(t.translated, t.to);
              }}
            >
              🔊 {ui.speak}
            </button>
            <button className="btn" type="button" onClick={() => copyTurn(t, i)}>
              {copied === i ? ui.copied : `📋 ${ui.copyText}`}
            </button>
            <QualityLed match={t.match} ui={ui} />
          </div>
        </section>
      ))}
    </>
  );
}
