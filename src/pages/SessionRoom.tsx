import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";
import { getRecognizer, speak, STT_LANG, stopSpeak, unlockSpeech } from "../lib/speech";
import { machineTranslate } from "../lib/translate";
import {
  SESSION_LANG_FLAG,
  SESSION_LANG_NAME,
  clearCreds,
  connectSession,
  loadCreds,
  saveCreds,
  type SessionConnection,
  type WsMsg,
} from "../lib/session";
import type { SessionLang } from "../types";

type Entry = { who: "me" | "peer"; original: string; translated: string };
type Phase = "idle" | "listening" | "translating" | "ready" | "playing";
type Mode = "auto" | "ptt";

function fallbackPeer(mine: SessionLang): SessionLang {
  return mine === "pt" ? "tr" : "pt";
}

export function SessionRoom() {
  const { lang } = useUiLang();
  const ui = UI[lang];
  const { code = "" } = useParams();
  const creds = loadCreds(code.toUpperCase());

  if (!creds) return <Navigate to={`/join/${code}`} replace />;
  return (
    <Room
      myLang={creds.myLang}
      initialPeerLang={creds.peerLang}
      code={creds.code}
      token={creds.token}
      role={creds.role}
      ui={ui}
    />
  );
}

function Room({
  myLang,
  initialPeerLang,
  code,
  token,
  role,
  ui,
}: {
  myLang: SessionLang;
  initialPeerLang: SessionLang | null;
  code: string;
  token: string;
  role: "a" | "b";
  ui: (typeof UI)[keyof typeof UI];
}) {
  const [peerLang, setPeerLang] = useState<SessionLang | null>(initialPeerLang);
  const [connected, setConnected] = useState(false);
  const [peerOnline, setPeerOnline] = useState(false);
  const [mode, setMode] = useState<Mode>("auto");
  const [phase, setPhase] = useState<Phase>("idle");
  const [active, setActive] = useState(false);
  const [myInterim, setMyInterim] = useState("");
  const [peerInterim, setPeerInterim] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [autoPlay, setAutoPlay] = useState(true);
  const rate = 0.95;
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState("");
  const [typed, setTyped] = useState("");

  const connRef = useRef<SessionConnection | null>(null);
  const recRef = useRef<ReturnType<typeof getRecognizer>>(null);
  const stateRef = useRef({
    mode,
    active,
    autoPlay,
    rate,
    peerLang,
    speaking: false,
    ended: false,
    myLang,
  });
  stateRef.current = { ...stateRef.current, mode, active, autoPlay, rate, peerLang, ended, myLang };

  const targetLang = peerLang ?? fallbackPeer(myLang);

  useEffect(() => {
    const conn = connectSession({
      code,
      token,
      role,
      lang: myLang,
      onMessage: handleMsg,
      onConnected: () => {
        setConnected(true);
        conn.send({ type: "joined", lang: myLang });
      },
      onDisconnected: () => setConnected(false),
    });
    connRef.current = conn;
    return () => {
      conn.close();
      recRef.current?.stop();
      stopSpeak();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, token]);

  function handleMsg(msg: WsMsg) {
    const st = stateRef.current;
    if (msg.type === "hello") {
      if (msg.peerLang) updatePeerLang(msg.peerLang);
      setPeerOnline(msg.peerOnline);
    } else if (msg.type === "joined") {
      updatePeerLang(msg.lang);
      setPeerOnline(true);
    } else if (msg.type === "peer") {
      setPeerOnline(msg.online);
    } else if (msg.type === "interim") {
      setPeerInterim(msg.text);
    } else if (msg.type === "utterance") {
      setPeerInterim("");
      setEntries((prev) => [{ who: "peer", original: msg.original, translated: msg.translated }, ...prev]);
      if (st.autoPlay) playIncoming(msg.translated);
    } else if (msg.type === "end") {
      setEnded(true);
      recRef.current?.stop();
    }
  }

  function updatePeerLang(l: SessionLang) {
    setPeerLang(l);
    const c = loadCreds(code);
    if (c && c.peerLang !== l) saveCreds({ ...c, peerLang: l });
  }

  function playIncoming(text: string) {
    const st = stateRef.current;
    stateRef.current.speaking = true;
    recRef.current?.stop();
    setPhase("playing");
    speak(text, myLang, {
      rate: st.rate,
      onEnd: () => {
        stateRef.current.speaking = false;
        setPhase("idle");
        if (stateRef.current.mode === "auto" && stateRef.current.active && !stateRef.current.ended) startRec(false);
      },
    });
  }

  async function handleFinal(text: string) {
    if (!text.trim()) return;
    const to = stateRef.current.peerLang ?? fallbackPeer(myLang);
    setPhase("translating");
    try {
      const result = await machineTranslate(text, myLang, to);
      setEntries((prev) => [{ who: "me", original: text, translated: result.text }, ...prev]);
      connRef.current?.send({ type: "utterance", original: text, translated: result.text });
      // Áudio só no telemóvel do destinatário — nunca eco no emissor.
      setPhase("ready");
      setTimeout(() => setPhase((p) => (p === "ready" ? "idle" : p)), 800);
      if (stateRef.current.mode === "auto" && stateRef.current.active && !stateRef.current.ended) startRec(false);
    } catch {
      setError(ui.translateFail);
      setPhase("idle");
    } finally {
      setMyInterim("");
      connRef.current?.send({ type: "interim", text: "" });
    }
  }

  function startRec(_continuous: boolean) {
    if (stateRef.current.speaking || stateRef.current.ended) return;
    stopSpeak();
    unlockSpeech();
    setError("");
    const rec = getRecognizer();
    if (!rec) {
      setError(ui.typeIfMicFails);
      setActive(false);
      return;
    }
    rec.lang = STT_LANG[myLang];
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      let interim = "";
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) void handleFinal(r[0].transcript);
        else interim += r[0].transcript;
      }
      if (interim) {
        setMyInterim(interim);
        connRef.current?.send({ type: "interim", text: interim });
      }
    };
    rec.onerror = (ev) => {
      if (ev.error === "not-allowed") setError(ui.typeIfMicFails);
      else if (ev.error !== "no-speech" && ev.error !== "aborted") setError(ev.error);
    };
    rec.onend = () => {
      const st = stateRef.current;
      if (st.mode === "auto" && st.active && !st.speaking && !st.ended) {
        setTimeout(() => {
          if (stateRef.current.active && !stateRef.current.speaking) {
            try {
              recRef.current?.start();
              setPhase("listening");
            } catch {
              /* restarting */
            }
          }
        }, 280);
        return;
      }
      setPhase((p) => (p === "listening" ? "idle" : p));
    };
    recRef.current = rec;
    try {
      rec.start();
      setPhase("listening");
    } catch {
      /* already started */
    }
  }

  function stopRec() {
    recRef.current?.stop();
    setPhase((p) => (p === "listening" ? "idle" : p));
  }

  function beginTalk() {
    unlockSpeech();
    if (active) {
      setActive(false);
      stateRef.current.active = false;
      stopRec();
    } else {
      setActive(true);
      stateRef.current.active = true;
      startRec(false);
    }
  }

  function endSession() {
    connRef.current?.send({ type: "end" });
    connRef.current?.close();
    recRef.current?.stop();
    stopSpeak();
    clearCreds();
    setEnded(true);
  }

  const lastIncoming = entries.find((e) => e.who === "peer");
  const lastAudio = lastIncoming;
  const listening = phase === "listening";

  if (ended) {
    return (
      <div className="room">
        <div className="roombody" style={{ textAlign: "center", paddingTop: "3rem" }}>
          <h2>⛔ {ui.sessionEnded}</h2>
          <Link className="btn primary" to="/">
            ← TİKA MZ Translator
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="room">
      <header className="room-top">
        <span className={connected ? "conn" : "conn off"}>
          <span className="dot" />
          {connected ? ui.connected : ui.reconnecting}
        </span>
        <span className="pair">
          {SESSION_LANG_FLAG[myLang]} {SESSION_LANG_NAME[myLang]} ↔ {SESSION_LANG_FLAG[targetLang]}{" "}
          {SESSION_LANG_NAME[targetLang]}
        </span>
        <button className="btn danger" type="button" onClick={endSession}>
          ⛔ {ui.endSession}
        </button>
      </header>

      <div className="roombody roombody-dock">
        {!peerOnline ? <p className="banner">{ui.waitOtherSpeak}</p> : null}

        <div className="idpanels">
          <section className={myInterim || listening ? "idcard speaking" : "idcard"}>
            <div className="who">
              {SESSION_LANG_FLAG[myLang]} {ui.you.toUpperCase()}
            </div>
            <div className="whatlang">{SESSION_LANG_NAME[myLang]}</div>
            <div className="state">{listening ? `🎙️ ${ui.micActive}` : `🎙️ ${ui.tapToSpeak}`}</div>
            {myInterim ? <p className="captions interim">{myInterim}…</p> : null}
          </section>
          <div className="updown" aria-hidden>
            ↕
          </div>
          <section className={peerInterim || phase === "playing" ? "idcard speaking" : "idcard"}>
            <div className="who">
              {SESSION_LANG_FLAG[targetLang]} {ui.translated.toUpperCase()}
            </div>
            <div className="whatlang">{SESSION_LANG_NAME[targetLang]}</div>
            <div className="state">
              {peerOnline ? `🔊 ${ui.receivingTr}` : `🔊 ${ui.playingAudio}`}
            </div>
            {peerInterim ? <p className="captions interim">{peerInterim}…</p> : null}
          </section>
        </div>

        <div className="modes">
          <button type="button" className={mode === "auto" ? "seg on" : "seg"} onClick={() => setMode("auto")}>
            🔁 {ui.autoMode}
          </button>
          <button
            type="button"
            className={mode === "ptt" ? "seg on" : "seg"}
            onClick={() => {
              setActive(false);
              stateRef.current.active = false;
              stopRec();
              setMode("ptt");
            }}
          >
            👆 {ui.pushToTalk}
          </button>
        </div>

        <label htmlFor="type-fallback">{ui.typeIfMicFails}</label>
        <textarea
          id="type-fallback"
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

        {error ? <p className="warn">{error}</p> : null}

        <div className="statuspanel" style={{ justifyContent: "center" }}>
          <label style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center", margin: 0 }}>
            <input
              type="checkbox"
              style={{ width: "auto" }}
              checked={autoPlay}
              onChange={(e) => setAutoPlay(e.target.checked)}
            />
            🔊 {ui.autoSpeak}
          </label>
          {lastAudio ? (
            <button
              className="btn primary"
              type="button"
              onClick={() => {
                unlockSpeech();
                playIncoming(lastAudio.translated);
              }}
            >
              🔊 {ui.replayBtn}
            </button>
          ) : null}
        </div>

        {entries.map((e, i) => (
          <section className={e.who === "me" ? "bubble me" : "bubble peer"} key={entries.length - i}>
            <p className="langtag">{e.who === "me" ? ui.you : ui.otherParticipant}</p>
            <p className="orig">{e.original}</p>
            <p className="trad">{e.translated}</p>
            {e.who === "peer" ? (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  unlockSpeech();
                  speak(e.translated, myLang, { rate });
                }}
              >
                🔊 {ui.replayBtn}
              </button>
            ) : null}
          </section>
        ))}
      </div>

      <div className="speak-dock">
        {mode === "auto" ? (
          <button className={listening ? "micbtn listening" : "micbtn"} type="button" onClick={beginTalk}>
            🎙️
          </button>
        ) : (
          <button
            className={listening ? "micbtn listening" : "micbtn"}
            type="button"
            onPointerDown={() => {
              unlockSpeech();
              startRec(false);
            }}
            onPointerUp={stopRec}
            onPointerLeave={() => listening && stopRec()}
          >
            🎙️
          </button>
        )}
        <p className="mic-label">
          {phase === "idle" ? (mode === "ptt" ? ui.holdToSpeak : ui.tapToSpeak) : null}
          {phase === "listening" ? (
            <>
              🔴 {ui.listening}
              <span className="waves" aria-hidden>
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
            </>
          ) : null}
          {phase === "translating" ? (
            <>
              🔵 {ui.translating}
              <span className="spinner" aria-hidden />
            </>
          ) : null}
          {phase === "playing" ? <>🔊 {ui.playingAudio}</> : null}
          {phase === "ready" ? <>🟢 {ui.trReady}</> : null}
        </p>
      </div>
    </div>
  );
}
