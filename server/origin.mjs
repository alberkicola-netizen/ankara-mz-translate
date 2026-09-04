import { readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STALE_MS = 6 * 60 * 60 * 1000;

/** HTTPS público configurado (env ou ficheiro do túnel), sem expirar por idade. */
export function configuredPublicOrigin() {
  return (process.env.PUBLIC_ORIGIN || filePublicOrigin({ maxAgeMs: null })).replace(/\/$/, "");
}

export function isLoopbackHost(host) {
  const h = String(host || "").replace(/^\[|\]$/g, "").split(":")[0];
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0";
}

export function lanIPv4() {
  const preferred = [];
  const other = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/virtual|vmware|vbox|hyper-v|loopback|docker|wsl|vethernet|bluetooth/i.test(name)) continue;
    for (const n of list ?? []) {
      if (n.family !== "IPv4" && n.family !== 4) continue;
      if (n.internal) continue;
      if (n.address.startsWith("169.254.")) continue;
      if (/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(n.address)) preferred.push(n.address);
      else other.push(n.address);
    }
  }
  return preferred[0] || other[0] || "127.0.0.1";
}

export function filePublicOrigin({ maxAgeMs = STALE_MS } = {}) {
  try {
    const p = path.join(path.dirname(fileURLToPath(import.meta.url)), "public-origin.txt");
    if (maxAgeMs != null) {
      const age = Date.now() - statSync(p).mtimeMs;
      if (age > maxAgeMs) return "";
    }
    const t = readFileSync(p, "utf8").trim();
    return t.startsWith("http") ? t.replace(/\/$/, "") : "";
  } catch {
    return "";
  }
}

/** Porta que o telemóvel deve usar: a do Host do pedido (Vite 5173) ou PORT do Node. */
export function clientListenPort(req) {
  const host = String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "");
  const m = host.match(/:(\d+)$/);
  if (m) return m[1];
  const proto = String(req?.headers?.["x-forwarded-proto"] || req?.protocol || "http")
    .split(",")[0]
    .trim();
  if (proto === "https") return "443";
  return String(process.env.PORT || 8787);
}

export function lanOrigin(req) {
  return `http://${lanIPv4()}:${clientListenPort(req)}`;
}

export function forwardedOrigin(req) {
  const proto = String(req?.headers?.["x-forwarded-proto"] || req?.protocol || "http")
    .split(",")[0]
    .trim();
  const host = String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "")
    .split(",")[0]
    .trim();
  if (!host || isLoopbackHost(host)) return "";
  return `${proto}://${host}`;
}

/**
 * Origem que a câmara do telemóvel consegue abrir.
 * HTTPS público (túnel fresco) > host reencaminhado > LAN com a porta certa.
 * Nunca devolve localhost.
 */
export function originFor(req) {
  return configuredPublicOrigin() || forwardedOrigin(req) || lanOrigin(req);
}

export function describeOrigin(origin) {
  let https = false;
  let loopback = true;
  try {
    const u = new URL(origin);
    https = u.protocol === "https:";
    loopback = isLoopbackHost(u.hostname);
  } catch {
    /* keep defaults */
  }
  return {
    origin,
    https,
    loopback,
    phoneReady: Boolean(origin) && !loopback,
    phoneReadyAnywhere: Boolean(origin) && !loopback && https,
  };
}
