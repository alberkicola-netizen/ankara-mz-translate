import test from "node:test";
import assert from "node:assert/strict";
import { clientListenPort, describeOrigin, forwardedOrigin, isLoopbackHost, originFor } from "./origin.mjs";

test("isLoopbackHost reconhece localhost e IPv6", () => {
  assert.equal(isLoopbackHost("localhost"), true);
  assert.equal(isLoopbackHost("127.0.0.1"), true);
  assert.equal(isLoopbackHost("192.168.1.10"), false);
  assert.equal(isLoopbackHost("condition-walls.trycloudflare.com"), false);
});

test("clientListenPort usa a porta do Host (Vite) em vez da PORT do Node", () => {
  assert.equal(clientListenPort({ headers: { host: "localhost:5173" } }), "5173");
  assert.equal(clientListenPort({ headers: { host: "192.168.1.10:5173" } }), "5173");
  const prev = process.env.PORT;
  process.env.PORT = "8787";
  assert.equal(clientListenPort({ headers: { host: "localhost" } }), "8787");
  process.env.PORT = prev;
});

test("forwardedOrigin ignora localhost e usa o túnel", () => {
  assert.equal(forwardedOrigin({ headers: { host: "localhost:5173" }, protocol: "http" }), "");
  assert.equal(
    forwardedOrigin({
      headers: { host: "abc.trycloudflare.com", "x-forwarded-proto": "https" },
      protocol: "http",
    }),
    "https://abc.trycloudflare.com",
  );
});

test("originFor nunca devolve localhost quando há LAN/túnel", () => {
  const prev = process.env.PUBLIC_ORIGIN;
  process.env.PUBLIC_ORIGIN = "https://live.example.test";
  const origin = originFor({ headers: { host: "localhost:5173" }, protocol: "http" });
  assert.equal(origin, "https://live.example.test");
  if (prev === undefined) delete process.env.PUBLIC_ORIGIN;
  else process.env.PUBLIC_ORIGIN = prev;
});

test("originFor prefere o Host HTTPS do pedido a um PUBLIC_ORIGIN morto", () => {
  const prev = process.env.PUBLIC_ORIGIN;
  process.env.PUBLIC_ORIGIN = "https://dead.example.test";
  const origin = originFor({
    headers: { host: "brave-crews-sin.loca.lt", "x-forwarded-proto": "https" },
    protocol: "http",
  });
  assert.equal(origin, "https://brave-crews-sin.loca.lt");
  if (prev === undefined) delete process.env.PUBLIC_ORIGIN;
  else process.env.PUBLIC_ORIGIN = prev;
});

test("describeOrigin marca ligações de telemóvel", () => {
  assert.equal(describeOrigin("https://x.trycloudflare.com").phoneReady, true);
  assert.equal(describeOrigin("https://x.trycloudflare.com").phoneReadyAnywhere, true);
  assert.equal(describeOrigin("http://192.168.1.5:5173").phoneReady, true);
  assert.equal(describeOrigin("http://192.168.1.5:5173").phoneReadyAnywhere, false);
  assert.equal(describeOrigin("http://localhost:5173").phoneReady, false);
});
