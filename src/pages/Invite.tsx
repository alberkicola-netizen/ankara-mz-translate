import { Link } from "react-router-dom";
import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";

export function Invite() {
  const { lang } = useUiLang();
  const ui = UI[lang];

  return (
    <>
      <h2>🔗 {ui.invite}</h2>
      <p className="muted">{ui.inviteGuideLead}</p>

      <article className="card" style={{ marginBottom: "0.9rem" }}>
        <h2>1. {ui.cardBiTitle}</h2>
        <p className="muted">{ui.inviteSessionHow}</p>
        <Link className="btn primary" to="/session/new">
          {ui.startConvo} →
        </Link>
      </article>

      <article className="card" style={{ marginBottom: "0.9rem" }}>
        <h2>2. {ui.cardGroupTitle}</h2>
        <p className="muted">{ui.inviteRoomHow}</p>
        <Link className="btn primary" to="/room/new">
          {ui.createRoomCta} →
        </Link>
      </article>

      <article className="card" style={{ marginBottom: "0.9rem" }}>
        <h2>3. {ui.scanQr}</h2>
        <p className="muted">{ui.inviteGuestHow}</p>
        <div className="actions">
          <Link className="btn" to="/join">
            {ui.joinTitle} →
          </Link>
          <Link className="btn" to="/join-room">
            {ui.joinRoomTitle} →
          </Link>
        </div>
      </article>

      <p className="banner">{ui.invitePinHow}</p>
    </>
  );
}
