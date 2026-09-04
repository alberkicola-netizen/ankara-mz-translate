import { useEffect, useState } from "react";
import { COHORT_PIN } from "../data/cohort";
import { fetchInviteOrigin, pcAppUrl } from "../lib/inviteUrl";
import { UI } from "../lib/i18n";
import { useUiLang } from "../lib/ui-lang";

export function PhoneAccess() {
  const { lang } = useUiLang();
  const ui = UI[lang];
  const [httpsUrl, setHttpsUrl] = useState("");
  const [lanUrl, setLanUrl] = useState("");
  const [copied, setCopied] = useState<"https" | "lan" | null>(null);

  useEffect(() => {
    let stop = false;
    async function load() {
      const data = await fetchInviteOrigin();
      if (stop || !data) return;
      const pin = `/?pin=${encodeURIComponent(COHORT_PIN)}`;
      const pub = (data.public || (data.https ? data.origin : "")).replace(/\/$/, "");
      const lan = (data.lan || "").replace(/\/$/, "");
      setHttpsUrl(pub ? pub + pin : "");
      setLanUrl(lan ? lan + pin : "");
    }
    void load();
    const id = setInterval(() => void load(), 8000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  function copy(which: "https" | "lan", value: string) {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1600);
    });
  }

  return (
    <article className="card" style={{ marginBottom: "1.1rem", border: "2px solid var(--navy)" }}>
      <h2>📱 {ui.phoneBoxTitle}</h2>
      <p className="muted">{ui.phoneBoxPc}</p>
      <p style={{ wordBreak: "break-all", fontWeight: 600 }}>{pcAppUrl(`/?pin=${encodeURIComponent(COHORT_PIN)}`)}</p>
      {httpsUrl ? (
        <>
          <p className="muted">{ui.phoneBoxHttps}</p>
          <p style={{ wordBreak: "break-all", fontWeight: 600 }}>{httpsUrl}</p>
          <button className="btn primary" type="button" onClick={() => copy("https", httpsUrl)}>
            {copied === "https" ? ui.copied : `📋 ${ui.copy}`}
          </button>
        </>
      ) : (
        <p className="warn">{ui.phoneBoxWait}</p>
      )}
      {lanUrl ? (
        <>
          <p className="muted" style={{ marginTop: "0.9rem" }}>
            {ui.phoneBoxLan}
          </p>
          <p style={{ wordBreak: "break-all" }}>{lanUrl}</p>
          <button className="btn" type="button" onClick={() => copy("lan", lanUrl)}>
            {copied === "lan" ? ui.copied : `📋 ${ui.copy}`}
          </button>
        </>
      ) : null}
    </article>
  );
}
