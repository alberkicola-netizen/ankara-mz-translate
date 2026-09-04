import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { UI } from "../lib/i18n";
import { isLoopbackUrl, type InviteOrigin } from "../lib/inviteUrl";

async function makeQr(url: string): Promise<string> {
  return QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "H" });
}

export function InviteShare({
  ui,
  title,
  hint,
  code,
  codeLabel,
  link,
  origin,
}: {
  ui: (typeof UI)[keyof typeof UI];
  title: string;
  hint: string;
  code: string;
  codeLabel: string;
  link: string;
  origin?: InviteOrigin | null;
}) {
  const [copied, setCopied] = useState<"link" | "code" | "ip" | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [gateIp, setGateIp] = useState("");

  useEffect(() => {
    let live = true;
    void fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(6000) })
      .then((r) => r.json())
      .then((d) => {
        if (live && typeof d?.ip === "string") setGateIp(d.ip);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    if (!link) {
      setQr("");
      return;
    }
    setQr(null);
    void makeQr(link)
      .then((data) => {
        if (live) setQr(data);
      })
      .catch(() => {
        if (live) setQr("");
      });
    return () => {
      live = false;
    };
  }, [link]);

  function copy(what: "link" | "code" | "ip", value: string) {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    });
  }

  const loopback = !link || isLoopbackUrl(link);
  const https = link.startsWith("https:");

  return (
    <>
      <h2>🟢 {title}</h2>
      {qr ? (
        <img
          src={qr}
          alt="QR"
          style={{
            width: "100%",
            maxWidth: "320px",
            display: "block",
            margin: "0.75rem auto",
            borderRadius: "16px",
            boxShadow: "var(--shadow-lg)",
          }}
        />
      ) : qr === null ? (
        <p className="muted" style={{ textAlign: "center" }}>
          <span className="spinner" />
        </p>
      ) : (
        <p className="banner">{ui.qrCodeFallback}</p>
      )}
      <p className="muted" style={{ textAlign: "center" }}>
        {hint}
      </p>
      {loopback ? <p className="warn">{ui.qrLocalhostWarn}</p> : null}
      {!loopback && !https ? <p className="banner">{ui.qrLanHint}</p> : null}
      {!loopback && https ? <p className="muted" style={{ textAlign: "center" }}>{ui.qrHttpsOk}</p> : null}
      {!loopback && https && /loca\.lt/i.test(link) ? (
        <>
          <p className="banner">{ui.qrTunnelGateHint}</p>
          {gateIp ? (
            <div className="codebox" style={{ marginTop: "0.5rem" }}>
              <span className="muted">{ui.qrTunnelIpLabel}</span>
              <strong style={{ fontSize: "1.6rem", letterSpacing: "0.06em" }}>{gateIp}</strong>
              <button className="btn" type="button" onClick={() => copy("ip", gateIp)}>
                {copied === "ip" ? ui.copied : `📋 ${ui.copy}`}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      {origin?.lan && loopback ? (
        <p className="muted" style={{ wordBreak: "break-all", textAlign: "center" }}>
          {ui.qrTryLan}: {origin.lan}
        </p>
      ) : null}
      <p className="muted" style={{ wordBreak: "break-all", textAlign: "center", fontSize: "0.75rem" }}>
        {link}
      </p>
      <div className="codebox">
        <span className="muted">{codeLabel}</span>
        <strong>{code}</strong>
      </div>
      <p className="muted" style={{ textAlign: "center" }}>
        {ui.codeForOther}
      </p>
      <div className="actions" style={{ justifyContent: "center", margin: "0.8rem 0" }}>
        <button className="btn" type="button" onClick={() => copy("link", link)} disabled={!link}>
          {copied === "link" ? ui.copied : `📋 ${ui.copy}`}
        </button>
        <button className="btn" type="button" onClick={() => copy("code", code)}>
          {copied === "code" ? ui.copied : `🔢 ${ui.copyCode}`}
        </button>
        {typeof navigator.share === "function" && link ? (
          <button
            className="btn"
            type="button"
            onClick={() => void navigator.share({ title: ui.title, url: link }).catch(() => undefined)}
          >
            📤 {ui.share}
          </button>
        ) : null}
      </div>
    </>
  );
}
