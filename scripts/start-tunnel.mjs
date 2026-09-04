/**
 * Túnel HTTPS que o telemóvel consegue resolver.
 *
 * Problema real: o quick tunnel da Cloudflare morre (sono do PC, Wi‑Fi, porta 7844)
 * e o processo fica zombie → DNS desaparece → Chrome mostra «This site can't be reached».
 *
 * Este script:
 *  1) abre a porta 8787 na firewall (LAN)
 *  2) Cloudflare HTTP/2 (TCP 443) — se o túnel morrer, cria OUTRO (URL nova)
 *  3) fallback SSH Pinggy na 443 se a Cloudflare falhar
 *
 * Uso: node scripts/start-tunnel.mjs [porta]
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { execSync } from "node:child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const originFile = path.join(root, "server", "public-origin.txt");
const port = Number(process.argv[2] || process.env.PORT || 8787);

mkdirSync(path.dirname(originFile), { recursive: true });

let publicUrl = "";
let stopping = false;
/** @type {import("node:child_process").ChildProcess | null} */
let child = null;
let mode = "";

function lanIPv4() {
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/virtual|vmware|vbox|hyper-v|loopback|docker|wsl|vethernet|bluetooth/i.test(name)) continue;
    for (const n of list ?? []) {
      if (n.family !== "IPv4" && n.family !== 4) continue;
      if (n.internal || n.address.startsWith("169.254.")) continue;
      if (/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(n.address)) return n.address;
    }
  }
  return "127.0.0.1";
}

function openFirewall() {
  try {
    execSync(
      `netsh advfirewall firewall add rule name="TIKA MZ Translator 8787" dir=in action=allow protocol=TCP localport=${port} profile=any`,
      { stdio: "ignore", windowsHide: true },
    );
    console.error(`Firewall: porta ${port} TCP aberta para a LAN.`);
  } catch {
    console.error(`Firewall: não consegui abrir a porta ${port} (precisa de Administrador). Abra manualmente se o telemóvel na mesma Wi‑Fi não ligar.`);
  }
}

function saveOrigin(url) {
  const clean = String(url || "").replace(/\/$/, "");
  if (!clean.startsWith("https:")) return;
  publicUrl = clean;
  writeFileSync(originFile, clean, "utf8");
  const lan = `http://${lanIPv4()}:${port}`;
  console.log(`\n========== LINKS =========`);
  console.log(`PC          http://127.0.0.1:${port}/?pin=ANKARA-MZ-26`);
  console.log(`Telemóvel   ${clean}/?pin=ANKARA-MZ-26`);
  console.log(`Mesma Wi-Fi ${lan}/?pin=ANKARA-MZ-26`);
  console.log(`==========================\n`);
}

function killChild() {
  if (!child) return;
  const proc = child;
  child = null;
  try {
    proc.kill();
  } catch {
    /* ignore */
  }
}

function spawnCf() {
  const args = [
    "tunnel",
    "--no-autoupdate",
    "--protocol",
    "http2",
    "--edge-ip-version",
    "4",
    "--url",
    `http://127.0.0.1:${port}`,
  ];
  const opts = { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, env: { ...process.env, TUNNEL_TRANSPORT_PROTOCOL: "http2" } };
  const npx = spawn("npx", ["--yes", "cloudflared", ...args], { ...opts, shell: true });
  return npx;
}

function spawnPinggy() {
  return spawn(
    "ssh",
    [
      "-T",
      "-n",
      "-p",
      "443",
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "ServerAliveInterval=30",
      "-o",
      "ExitOnForwardFailure=yes",
      "-R",
      `0:127.0.0.1:${port}`,
      "a.pinggy.io",
    ],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
}

function attachLogs(proc, onUrl, onDead) {
  const feed = (buf) => {
    const s = String(buf);
    process.stderr.write(s);
    const m = s.match(/https:\/\/[a-z0-9-]+\.(?:trycloudflare\.com|a\.pinggy\.io|pinggy\.link)/i);
    if (m) onUrl(m[0].toLowerCase().replace(/\/$/, ""));
    if (/Tunnel not found|Unauthorized: Tunnel not found|Unable to reach the origin service/i.test(s)) onDead();
  };
  proc.stdout?.on("data", feed);
  proc.stderr?.on("data", feed);
}

function startCloudflare() {
  if (stopping) return;
  killChild();
  mode = "cloudflare";
  console.error("\nA ligar túnel Cloudflare HTTP/2 (TCP 443)…\n");
  const proc = spawnCf();
  child = proc;
  let gotUrl = false;
  let deadOnce = false;
  attachLogs(
    proc,
    (url) => {
      gotUrl = true;
      saveOrigin(url);
    },
    () => {
      if (deadOnce || stopping) return;
      deadOnce = true;
      console.error("Túnel Cloudflare revogado — a criar um NOVO endereço…");
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
    },
  );
  proc.on("error", (err) => {
    console.error("cloudflared:", err?.message || err);
  });
  proc.on("exit", () => {
    if (child !== proc) return;
    child = null;
    if (stopping) return;
    if (!gotUrl) {
      console.error("Cloudflare não deu URL — a tentar Pinggy (SSH 443)…");
      startPinggy();
      return;
    }
    setTimeout(() => startCloudflare(), 1500);
  });
  setTimeout(() => {
    if (stopping || gotUrl || child !== proc) return;
    console.error("Cloudflare lento — a tentar Pinggy em paralelo não; a esperar mais 20s.");
  }, 40000);
}

function startPinggy() {
  if (stopping) return;
  killChild();
  mode = "pinggy";
  console.error("\nA ligar túnel Pinggy (SSH porta 443)…\n");
  const proc = spawnPinggy();
  child = proc;
  let gotUrl = false;
  attachLogs(proc, (url) => {
    gotUrl = true;
    saveOrigin(url);
  }, () => undefined);
  proc.on("error", (err) => {
    console.error("ssh/pinggy:", err?.message || err);
    if (!stopping) setTimeout(() => startCloudflare(), 3000);
  });
  proc.on("exit", (code) => {
    if (child !== proc) return;
    child = null;
    if (stopping) return;
    console.error(`Pinggy saiu (${code}). A voltar à Cloudflare…`);
    setTimeout(() => startCloudflare(), 2000);
  });
  setTimeout(() => {
    if (stopping || gotUrl || child !== proc) return;
    console.error("Pinggy sem URL — a voltar à Cloudflare.");
    try {
      proc.kill();
    } catch {
      /* ignore */
    }
  }, 25000);
}

async function localOk() {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(3000) });
    return r.ok || r.status < 500;
  } catch {
    return false;
  }
}

if (!(await localOk())) {
  console.error(`O servidor NÃO está em http://127.0.0.1:${port} — corra primeiro: npm start`);
  process.exit(1);
}

openFirewall();
console.error(`LAN para a mesma Wi‑Fi: http://${lanIPv4()}:${port}/?pin=ANKARA-MZ-26`);
startCloudflare();

setInterval(() => {
  if (publicUrl) writeFileSync(originFile, publicUrl, "utf8");
}, 2 * 60 * 1000);

function shutdown() {
  stopping = true;
  killChild();
  try {
    unlinkSync(originFile);
  } catch {
    /* ignore */
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
