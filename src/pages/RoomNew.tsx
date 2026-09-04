import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";
import { SESSION_LANGS, SESSION_LANG_FLAG, SESSION_LANG_NAME } from "../lib/session";
import {
  connectRoom,
  createRoom,
  saveRoomCreds,
  type RoomConnection,
  type RoomPresence,
} from "../lib/rooms";
import { supabase } from "../lib/supabaseClient";
import { fetchInviteOrigin, isLoopbackUrl, phoneRoomUrl, type InviteOrigin } from "../lib/inviteUrl";
import { classifyNetworkError } from "../lib/net";
import { InviteShare } from "../components/InviteShare";
import type { SessionLang } from "../types";

export function RoomNew() {
  const { lang } = useUiLang();
  const ui = UI[lang];
  const nav = useNavigate();
  const [name, setName] = useState("Anfitrião");
  const [speakLang, setSpeakLang] = useState<SessionLang>(lang);
  const [hearLang, setHearLang] = useState<SessionLang>(lang);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [roomId, setRoomId] = useState("");
  const [link, setLink] = useState("");
  const [origin, setOrigin] = useState<InviteOrigin | null>(null);
  const [people, setPeople] = useState<RoomPresence[]>([]);
  const connRef = useRef<RoomConnection | null>(null);

  useEffect(() => {
    void fetchInviteOrigin().then(setOrigin);
    return () => connRef.current?.close();
  }, []);

  async function create() {
    setBusy(true);
    setError("");
    try {
      const displayName = name.trim() || "Anfitrião";
      const r = await createRoom({
        displayName,
        sourceLanguage: speakLang,
        targetLanguage: hearLang,
      });
      const me = {
        roomId: r.roomId,
        participantId: r.participantId,
        displayName,
        sourceLanguage: speakLang,
        targetLanguage: hearLang,
        isHost: true,
      };
      saveRoomCreds(me);
      let url = r.publicUrl || "";
      if (!url || isLoopbackUrl(url)) {
        url = await phoneRoomUrl(r.roomId);
      }
      setRoomId(r.roomId);
      setLink(url);
      connRef.current = connectRoom({
        roomId: r.roomId,
        me: {
          participantId: r.participantId,
          displayName: me.displayName,
          sourceLanguage: speakLang,
          targetLanguage: hearLang,
        },
        onMessage: () => undefined,
        onTranslated: () => undefined,
        onClosed: () => undefined,
        onPresence: setPeople,
        onStatus: () => undefined,
      });
    } catch (e) {
      setError(
        e instanceof Error && e.message === "not-configured"
          ? ui.roomsOff
          : classifyNetworkError(e, ui),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!roomId) {
    return (
      <>
        <h2>👥 {ui.createRoom}</h2>
        <p className="muted">{ui.inviteRoomHow}</p>
        <label htmlFor="room-name">{ui.yourName}</label>
        <input
          id="room-name"
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
        {origin && !origin.https ? <p className="banner">{origin.loopback ? ui.qrLocalhostWarn : ui.qrLanHint}</p> : null}
        {error ? <p className="warn">{error}</p> : null}
        <button className="btn primary wide" type="button" disabled={busy} onClick={() => void create()}>
          {busy ? <span className="spinner" /> : `📱 ${ui.generateQr}`}
        </button>
      </>
    );
  }

  return (
    <>
      {!supabase ? <p className="warn">{ui.roomsOff}</p> : null}
      <InviteShare
        ui={ui}
        title={ui.roomReady}
        hint={ui.roomInviteHint}
        code={roomId}
        codeLabel={ui.roomCode}
        link={link}
        origin={origin}
      />
      <h3>
        {ui.participants} ({people.length})
      </h3>
      <ul className="plain">
        {people.map((p) => (
          <li key={p.participantId}>
            {SESSION_LANG_FLAG[p.sourceLanguage]} <strong>{p.displayName}</strong>{" "}
            <span className="muted">
              {SESSION_LANG_NAME[p.sourceLanguage]} → {SESSION_LANG_NAME[p.targetLanguage]}
            </span>
          </li>
        ))}
      </ul>
      <button className="btn primary wide" type="button" onClick={() => nav(`/room/${roomId}`)}>
        {ui.openRoom} →
      </button>
    </>
  );
}
