import { useState } from "react";
import { saveEval } from "../lib/storage";
import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";
import { getEvals } from "../lib/storage";

export function Evaluation() {
  const { lang } = useUiLang();
  const ui = UI[lang];
  const [role, setRole] = useState<"observer" | "preceptor">("observer");
  const [saved, setSaved] = useState(false);
  const [scores, setScores] = useState<Record<string, string>>({
    greet: "3",
    pain: "3",
    nurse: "3",
    time: "15-30s",
    speech: "never",
    incidents: "0",
    missing: "",
    continue: "yes",
    trust: "3",
    reduce: "3",
    unsafe: "no",
    continueP: "yes",
  });

  function set(k: string, v: string) {
    setScores((s) => ({ ...s, [k]: v }));
  }

  return (
    <>
      <h2>{ui.evaluation}</h2>
      <p className="muted">Week 4 · no patient identifiers · {ui.evalSaved}</p>
      <label>Role</label>
      <select value={role} onChange={(e) => setRole(e.target.value as "observer" | "preceptor")}>
        <option value="observer">Observer</option>
        <option value="preceptor">Preceptor</option>
      </select>

      {role === "observer" ? (
        <>
          <label>Greeting / role (1–5)</label>
          <select value={scores.greet} onChange={(e) => set("greet", e.target.value)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <label>Ask about pain (1–5)</label>
          <select value={scores.pain} onChange={(e) => set("pain", e.target.value)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <label>Call a Turkish nurse (1–5)</label>
          <select value={scores.nurse} onChange={(e) => set("nurse", e.target.value)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <label>Time to find a typical card</label>
          <select value={scores.time} onChange={(e) => set("time", e.target.value)}>
            <option value="under15">under 15 s</option>
            <option value="15-30s">15–30 s</option>
            <option value="over30">over 30 s</option>
          </select>
          <label>Draft speech used</label>
          <select value={scores.speech} onChange={(e) => set("speech", e.target.value)}>
            <option value="never">never</option>
            <option value="sometimes">sometimes</option>
            <option value="often">often</option>
          </select>
          <label>Could not communicate (count)</label>
          <input type="text" value={scores.incidents} onChange={(e) => set("incidents", e.target.value)} />
          <label>Missing phrases (situations only)</label>
          <textarea rows={3} value={scores.missing} onChange={(e) => set("missing", e.target.value)} />
          <label>Keep using the tool?</label>
          <select value={scores.continue} onChange={(e) => set("continue", e.target.value)}>
            <option value="yes">yes</option>
            <option value="mixed">mixed</option>
            <option value="no">no</option>
          </select>
        </>
      ) : (
        <>
          <label>Trust phrase cards (1–5)</label>
          <select value={scores.trust} onChange={(e) => set("trust", e.target.value)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <label>Reduced need to interpret simple sentences (1–5)</label>
          <select value={scores.reduce} onChange={(e) => set("reduce", e.target.value)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <label>Unsafe use seen?</label>
          <select value={scores.unsafe} onChange={(e) => set("unsafe", e.target.value)}>
            <option value="no">no</option>
            <option value="yes">yes</option>
          </select>
          <label>Continue after pilot?</label>
          <select value={scores.continueP} onChange={(e) => set("continueP", e.target.value)}>
            <option value="yes">yes</option>
            <option value="notyet">not yet</option>
            <option value="no">no</option>
          </select>
        </>
      )}

      <button
        className="btn primary wide"
        type="button"
        style={{ marginTop: "1rem" }}
        onClick={() => {
          saveEval({ role, at: new Date().toISOString(), scores });
          setSaved(true);
        }}
      >
        Save on this phone
      </button>
      {saved ? <p>{ui.evalSaved}</p> : null}
      <p className="muted">Stored locally: {getEvals().length} form(s)</p>
    </>
  );
}
