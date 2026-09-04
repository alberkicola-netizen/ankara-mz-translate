import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

/** SW antigo no telemóvel servia JS velho («sem rede») e bloqueava /api. */
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const r of regs) void r.unregister();
  });
}
if (typeof caches !== "undefined") {
  void caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
