import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";
import { SESSION_LANG_FLAG, SESSION_LANG_NAME } from "../lib/session";
import {
  clearRoomCreds,
  closeRoom,
  connectRoom,
  fetchRoomMessages,
  fetchRoomsMeta,
  loadRoomCreds,
  sendRoomSpeech,
  sendRoomText,
  type RoomConnection,
  type RoomCreds,
  type RoomMessage,
  type RoomPresence,
} from "../lib/rooms";
import { supabase } from "../lib/supabaseClient";
import { getRecognizer, speak, STT_LANG, stopSpeak, unlockSpeech } from "../lib/speech";

type RecPhase = "idle" | "recording" | "transcribing";

export function RoomPage() {
  const { lang } = useUiLang();
  const ui = UI[lang];
  const { roomId = "" } = useParams();
  const creds = loadRoomCreds(roomId.toUpperCase());

  if (!creds) return <Navigate to={`/join-room/${roomId.toUpperCase()}`} replace />;
  return <Room creds={creds} ui={ui} />;
}

function Room({ creds, ui }: { creds: RoomCreds; ui: (typeof UI)[keyof typeof UI] }) {
  const [connected, setConnected] = useState(false);
  const [people, setPeople] = useState<RoomPresence[]>([]);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [typed, setTyped] = useState("");
  const [sending, setSending] = useState(false);
  const [recPhase, setRecPhase] = useState<RecPhase>("idle");
  const [sttAvailable, setSttAvailable] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState("");
  const browserStt = typeof window !== "undefined" && Boolean(getRecognizer());

  const connRef = useRef<RoomConnection | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recRef = useRef<ReturnType<typeof getRecognizer>>(null);
  const chunksRef = useRef<Blob[]>([]);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const credsRef = useRef(creds);
  credsRef.current = creds;

  const upsertMessage = useCallback(
    (m: RoomMessage) => {
      const me = credsRef.current.participantId;
      const hear = credsRef.current.targetLanguage;
      setMessages((prev) => {
        const mine = m.fromId === me;
        if (mine) {
          if (prev.some((x) => x.clientKey === m.clientKey && x.fromId === m.fromId)) return prev;
          return [...prev, { ...m, mine: true, pending: false }];
        }
        if (m.targetLanguage !== hear) return prev;
        if (prev.some((x) => x.utteranceId === m.utteranceId)) return prev;
        return [...prev, { ...m, mine: false }];
      });
    },
    [],
  );

  useEffect(() => {
    void fetchRoomsMeta().then((meta) => setSttAvailable(meta.stt));
    void fetchRoomMessages(creds.roomId, creds.participantId).then(setMessages);

    connRef.current = connectRoom({
      roomId: creds.roomId,
      me: {
        participantId: creds.participantId,
        displayName: creds.displayName,
        sourceLanguage: creds.sourceLanguage,
        targetLanguage: creds.targetLanguage,
      },
      onMessage: upsertMessage,
      onTranslated: (p) => {
        const me = credsRef.current;
        // Eco: nunca reproduzir nem actualizar a tradução no telemóvel de quem falou.
        if (p.fromId && p.fromId === me.participantId) return;
        if (p.targetLanguage !== me.targetLanguage) return;
        setMessages((prev) => {
          const row = prev.find((m) => m.utteranceId === p.utteranceId);
          if (row?.mine) return prev;
          return prev.map((m) =>
            m.utteranceId === p.utteranceId
              ? { ...m, translatedText: p.translatedText, failed: p.failed, pending: false }
              : m,
          );
        });
        if (!p.failed && p.translatedText) {
          unlockSpeech();
          speak(p.translatedText, me.targetLanguage, { rate: 1.05 });
        }
      },
      onClosed: () => setClosed(true),
      onPresence: setPeople,
      onStatus: setConnected,
    });
    return () => {
      connRef.current?.close();
      recRef.current?.stop();
      stopSpeak();
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creds.roomId, creds.participantId]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function sendText() {
    const text = typed.trim();
    if (!text) return;
    setSending(true);
    setError("");
    unlockSpeech();
    try {
      await sendRoomText(creds.roomId, creds.participantId, text);
      setTyped("");
    } catch {
      setError(ui.translateFail);
    } finally {
      setSending(false);
    }
  }

  /** STT rápido no telemóvel (Web Speech) — evita o upload para Whisper. */
  function startBrowserStt() {
    const rec = getRecognizer();
    if (!rec) return false;
    unlockSpeech();
    setError("");
    rec.lang = STT_LANG[creds.sourceLanguage];
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const last = ev.results[ev.results.length - 1];
      const text = last?.[0]?.transcript?.trim();
      if (text) {
        setRecPhase("transcribing");
        void sendRoomText(creds.roomId, creds.participantId, text)
          .catch(() => setError(ui.translateFail))
          .finally(() => setRecPhase("idle"));
      }
    };
    rec.onerror = (ev) => {
      if (ev.error === "not-allowed") setError(ui.typeIfMicFails);
      else if (ev.error !== "no-speech" && ev.error !== "aborted") setError(ev.error);
      setRecPhase("idle");
    };
    rec.onend = () => {
      if (recPhase === "recording") setRecPhase("idle");
    };
    recRef.current = rec;
    try {
      rec.start();
      setRecPhase("recording");
      return true;
    } catch {
      return false;
    }
  }

  function stopBrowserStt() {
    recRef.current?.stop();
  }

  async function startRecording() {
    if (recPhase !== "idle") return;
    if (startBrowserStt()) return;
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        void uploadSpeech(blob);
      };
      recorderRef.current = mr;
      mr.start();
      setRecPhase("recording");
    } catch {
      setError(ui.typeIfMicFails);
    }
  }

  function stopRecording() {
    stopBrowserStt();
    const mr = recorderRef.current;
    if (mr && mr.state === "recording") {
      setRecPhase("transcribing");
      mr.stop();
    }
  }

  async function uploadSpeech(blob: Blob) {
    if (blob.size < 1000) {
      // gravação demasiado curta (toque acidental)
      setRecPhase("idle");
      return;
    }
    try {
      await sendRoomSpeech(creds.roomId, creds.participantId, blob);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "stt-off") setError(ui.sttOff);
      else if (msg === "nothing-recognized") setError(ui.nothingRecognized);
      else setError(ui.translateFail);
    } finally {
      setRecPhase("idle");
    }
  }

  async function endRoom() {
    if (creds.isHost) await closeRoom(creds.roomId, creds.participantId).catch(() => undefined);
    clearRoomCreds();
    setClosed(true);
  }

  if (closed) {
    return (
      <div className="room">
        <div className="roombody" style={{ textAlign: "center", paddingTop: "3rem" }}>
          <h2>⛔ {ui.roomClosedMsg}</h2>
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
          {ui.roomCode}: <strong>{creds.roomId}</strong>
        </span>
        <button className="btn danger" type="button" onClick={() => void endRoom()}>
          ⛔ {creds.isHost ? ui.closeRoom : ui.endSession}
        </button>
      </header>

      <div className="roombody roombody-dock">
        {!supabase ? <p className="warn">{ui.roomsOff}</p> : null}

        <p className="muted" style={{ margin: "0.35rem 0 0.8rem" }}>
          {ui.yourId}: <code>{creds.participantId.slice(0, 8)}</code>
          {" · "}
          {SESSION_LANG_FLAG[creds.sourceLanguage]} {SESSION_LANG_NAME[creds.sourceLanguage]}
          {" → "}
          {ui.hearIn} {SESSION_LANG_FLAG[creds.targetLanguage]} {SESSION_LANG_NAME[creds.targetLanguage]}
        </p>

        <div className="actions" style={{ flexWrap: "wrap", gap: "0.4rem" }}>
          {people.map((p) => (
            <span key={p.participantId} className="btn" style={{ pointerEvents: "none" }}>
              {SESSION_LANG_FLAG[p.sourceLanguage]} {p.displayName}
              {p.participantId === creds.participantId ? ` (${ui.you})` : ""}
              <span className="muted"> → {SESSION_LANG_NAME[p.targetLanguage]}</span>
            </span>
          ))}
        </div>

        {messages.map((m) => (
          <section className={m.mine ? "bubble me" : "bubble peer"} key={m.utteranceId}>
            <p className="langtag">
              {SESSION_LANG_FLAG[m.sourceLanguage]} {m.mine ? ui.you : m.fromName}
            </p>
            <p className="orig">{m.sourceText}</p>
            {m.mine ? null : m.pending ? (
              <p className="trad muted">
                🌐 {ui.translating} <span className="spinner" aria-hidden />
              </p>
            ) : m.failed || m.translatedText == null ? (
              <p className="trad warn">{ui.trUnavailable}</p>
            ) : (
              <p className="trad">{m.translatedText}</p>
            )}
          </section>
        ))}
        <div ref={listEndRef} />

        <label htmlFor="room-text">{ui.typeIfMicFails}</label>
        <textarea
          id="room-text"
          rows={2}
          placeholder={ui.typePlaceholder}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        <button
          className="btn primary wide"
          type="button"
          disabled={!typed.trim() || sending}
          onClick={() => void sendText()}
        >
          {sending ? <span className="spinner" /> : `📤 ${ui.sendText}`}
        </button>

        {error ? <p className="warn">{error}</p> : null}
        {!browserStt && !sttAvailable ? <p className="muted">{ui.sttOff}</p> : null}
      </div>

      {browserStt || sttAvailable ? (
        <div className="speak-dock">
          <button
            className={recPhase === "recording" ? "micbtn listening" : "micbtn"}
            type="button"
            disabled={recPhase === "transcribing"}
            onPointerDown={() => void startRecording()}
            onPointerUp={stopRecording}
            onPointerLeave={() => recPhase === "recording" && stopRecording()}
            onContextMenu={(e) => e.preventDefault()}
          >
            🎙️
          </button>
          <p className="mic-label">
            {recPhase === "idle" ? ui.holdToSpeak : null}
            {recPhase === "recording" ? (
              <>
                🔴 {ui.recording}
                <span className="waves" aria-hidden>
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </>
            ) : null}
            {recPhase === "transcribing" ? (
              <>
                📝 {ui.transcribing}
                <span className="spinner" aria-hidden />
              </>
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}
