import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";
import { SESSION_LANGS, SESSION_LANG_FLAG, SESSION_LANG_NAME } from "../lib/session";
import { getRoomInfo, joinRoom, saveRoomCreds, type RoomInfo } from "../lib/rooms";
import type { SessionLang } from "../types";

type State =
  | { kind: "code" }
  | { kind: "loading" }
  | { kind: "gone" }
  | { kind: "full" }
  | { kind: "ready"; info: RoomInfo };

/** Entrada na sala de grupo (sem PIN — chega-se aqui pelo QR /?room=ID). */
export function RoomJoin() {
  const { lang, setLang } = useUiLang();
  const ui = UI[lang];
  const nav = useNavigate();
  const { roomId: raw = "" } = useParams();
  const roomId = raw.trim().toUpperCase();
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<State>(roomId ? { kind: "loading" } : { kind: "code" });
  const [name, setName] = useState("");
  const [speakLang, setSpeakLang] = useState<SessionLang>(lang);
  const [hearLang, setHearLang] = useState<SessionLang>(lang);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!roomId) {
      setState({ kind: "code" });
      return;
    }
    setState({ kind: "loading" });
    getRoomInfo(roomId)
      .then((info) => {
        if (info === "gone") setState({ kind: "gone" });
        else if (info.participantCount >= info.maxParticipants) setState({ kind: "full" });
        else setState({ kind: "ready", info });
      })
      .catch(() => setState({ kind: "gone" }));
  }, [roomId]);

  async function enter() {
    setBusy(true);
    const res = await joinRoom(roomId, {
      displayName: name.trim(),
      sourceLanguage: speakLang,
      targetLanguage: hearLang,
    }).catch(() => "gone" as const);
    setBusy(false);
    if (res === "gone") return setState({ kind: "gone" });
    if (res === "full") return setState({ kind: "full" });
    saveRoomCreds({
      roomId,
      participantId: res.participantId,
      displayName: name.trim(),
      sourceLanguage: speakLang,
      targetLanguage: hearLang,
      isHost: false,
    });
    nav(`/room/${roomId}`);
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
        <h1>{ui.joinRoomTitle}</h1>
        <div className="box">
          {state.kind === "code" ? (
            <>
              <label htmlFor="room-code">{ui.roomCode}</label>
              <input
                id="room-code"
                type="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={8}
                value={typed}
                onChange={(e) => setTyped(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && typed.length >= 4) nav(`/join-room/${typed}`);
                }}
              />
              <button
                className="btn primary wide"
                type="button"
                disabled={typed.length < 4}
                onClick={() => nav(`/join-room/${typed}`)}
                style={{ marginTop: "0.8rem" }}
              >
                {ui.enterRoom}
              </button>
            </>
          ) : null}

          {state.kind === "loading" ? (
            <p className="muted">
              <span className="spinner" /> …
            </p>
          ) : null}

          {state.kind === "gone" ? <p className="warn">{ui.roomGone}</p> : null}
          {state.kind === "full" ? <p className="warn">{ui.roomFull}</p> : null}

          {state.kind === "ready" ? (
            <>
              <p className="muted">
                {ui.participants}: <strong>{state.info.participantCount}</strong> ·{" "}
                {state.info.languages.map((l) => SESSION_LANG_FLAG[l]).join(" ")}
              </p>
              <label htmlFor="join-name">{ui.yourName}</label>
              <input
                id="join-name"
                type="text"
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <label>{ui.iSpeak}</label>
              <div className="langpick">
                {SESSION_LANGS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={speakLang === l ? "pick on" : "pick"}
                    onClick={() => setSpeakLang(l)}
                  >
                    <span className="flag">{SESSION_LANG_FLAG[l]}</span> {SESSION_LANG_NAME[l]}
                  </button>
                ))}
              </div>
              <label>{ui.iReceive}</label>
              <div className="langpick">
                {SESSION_LANGS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={hearLang === l ? "pick on" : "pick"}
                    onClick={() => setHearLang(l)}
                  >
                    <span className="flag">{SESSION_LANG_FLAG[l]}</span> {SESSION_LANG_NAME[l]}
                  </button>
                ))}
              </div>
              <button
                className="btn primary wide"
                type="button"
                disabled={busy || !name.trim()}
                onClick={() => void enter()}
                style={{ marginTop: "0.8rem" }}
              >
                {busy ? <span className="spinner" /> : ui.enterRoom}
              </button>
            </>
          ) : null}
        </div>
      </section>

      <footer className="landing-foot">TİKA • Ankara Üniversitesi • Moçambique</footer>
    </div>
  );
}
