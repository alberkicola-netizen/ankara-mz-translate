import { useRef, useState } from "react";
import { PHRASES } from "../data/phrases";
import { PhraseCard } from "../components/PhraseCard";
import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";
import { getRecognizer, matchPhrases, speak, STT_LANG, stopSpeak } from "../lib/speech";
import type { Lang, Phrase } from "../types";

export function SpeechPage() {
  const { lang } = useUiLang();
  const ui = UI[lang];
  const [listenLang, setListenLang] = useState<Lang>("pt");
  const [heard, setHeard] = useState("");
  const [listening, setListening] = useState(false);
  const [matches, setMatches] = useState<Phrase[]>([]);
  const [confirm, setConfirm] = useState<Phrase | null>(null);
  const [staffOk, setStaffOk] = useState(false);
  const recRef = useRef<ReturnType<typeof getRecognizer>>(null as ReturnType<typeof getRecognizer>);

  function start() {
    stopSpeak();
    const rec = getRecognizer();
    if (!rec) {
      setHeard("Speech recognition is not available in this browser. Use Chrome on Android. Show cards instead.");
      return;
    }
    rec.lang = STT_LANG[listenLang];
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const text = ev.results[0]?.[0]?.transcript ?? "";
      setHeard(text);
      setMatches(matchPhrases(text, PHRASES));
      setConfirm(null);
      setStaffOk(false);
    };
    rec.onerror = (ev) => {
      setHeard(ev.error);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  function stop() {
    recRef.current?.stop();
    setListening(false);
  }

  const show = confirm ?? matches[0];

  return (
    <>
      <div className="banner">{ui.draft}</div>
      <p className="muted">Phase 2: on-device / browser speech. Audio is not uploaded. Match approved cards first.</p>
      <label>Listen language</label>
      <select value={listenLang} onChange={(e) => setListenLang(e.target.value as Lang)}>
        <option value="pt">Português</option>
        <option value="tr">Türkçe</option>
        <option value="en">English</option>
      </select>
      <div className="actions" style={{ margin: "0.75rem 0" }}>
        <button className="btn primary" type="button" onClick={listening ? stop : start}>
          {listening ? ui.stop : ui.listen}
        </button>
      </div>
      {heard ? (
        <>
          <h3>{ui.heard}</h3>
          <p style={{ fontSize: "1.2rem" }}>{heard}</p>
        </>
      ) : null}

      {show && !confirm ? <h3>{ui.matched}</h3> : null}
      {matches.length === 0 && heard ? <p className="warn">{ui.noMatch}</p> : null}

      {!confirm &&
        matches.map((p) => (
          <div key={p.id}>
            <PhraseCard phrase={p} />
            <button className="btn primary wide" type="button" onClick={() => setConfirm(p)}>
              {ui.confirmStaff}
            </button>
          </div>
        ))}

      {heard && matches.length === 0 ? (
        <StaffConfirm raw={heard} onCall={() => setStaffOk(true)} done={staffOk} />
      ) : null}

      {confirm ? (
        <StaffBoard
          phrase={confirm}
          onBack={() => setConfirm(null)}
          onCall={() => setStaffOk(true)}
          done={staffOk}
        />
      ) : null}
    </>
  );
}

function StaffConfirm({ raw, onCall, done }: { raw: string; onCall: () => void; done: boolean }) {
  const { lang } = useUiLang();
  const ui = UI[lang];
  return (
    <section className="phrase">
      <h2>{ui.confirmStaff}</h2>
      <p className="warn">{ui.noMatch}</p>
      <p style={{ fontSize: "1.35rem" }}>{raw}</p>
      <button className="btn danger wide" type="button" onClick={onCall}>
        {ui.callPreceptor}
      </button>
      {done ? <p>Preceptor path: use card o05 (I need a Turkish nurse now) at the station.</p> : null}
      <p className="muted">Do not copy this into the medical record as a translation.</p>
    </section>
  );
}

function StaffBoard({
  phrase,
  onBack,
  onCall,
  done,
}: {
  phrase: Phrase;
  onBack: () => void;
  onCall: () => void;
  done: boolean;
}) {
  const { lang } = useUiLang();
  const ui = UI[lang];
  return (
    <section className="phrase" style={{ borderColor: "var(--accent)" }}>
      <h2>{ui.confirmStaff}</h2>
      <p className="muted">Staff reads Turkish. Observer checks Portuguese. English if needed.</p>
      <p className="langtag">TR</p>
      <p style={{ fontSize: "1.6rem" }}>{phrase.tr}</p>
      <button type="button" className="btn" onClick={() => speak(phrase.tr, "tr")}>
        {ui.speak} TR
      </button>
      <p className="langtag">PT</p>
      <p style={{ fontSize: "1.4rem" }}>{phrase.pt}</p>
      <p className="langtag">EN</p>
      <p>{phrase.en}</p>
      <div className="actions">
        <button className="btn danger wide" type="button" onClick={onCall}>
          {ui.callPreceptor}
        </button>
        <button className="btn wide" type="button" onClick={onBack}>
          ←
        </button>
      </div>
      {done ? (
        <p>
          Use approved card{" "}
          <strong>o05</strong> at the nurses’ station if the preceptor is not in the room.
        </p>
      ) : null}
    </section>
  );
}
