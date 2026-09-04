import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            const host = req.headers.host;
            if (host) proxyReq.setHeader("x-forwarded-host", String(host));
            const proto = String(req.headers["x-forwarded-proto"] || "http")
              .split(",")[0]
              .trim();
            proxyReq.setHeader("x-forwarded-proto", proto === "https" ? "https" : "http");
          });
        },
      },
      "/ws": { target: "ws://localhost:8787", ws: true },
    },
  },
  preview: {
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            const host = req.headers.host;
            if (host) proxyReq.setHeader("x-forwarded-host", String(host));
            const proto = String(req.headers["x-forwarded-proto"] || "http")
              .split(",")[0]
              .trim();
            proxyReq.setHeader("x-forwarded-proto", proto === "https" ? "https" : "http");
          });
        },
      },
      "/ws": { target: "ws://localhost:8787", ws: true },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["favicon.svg"],
      devOptions: { enabled: false },
      manifest: {
        name: "TİKA Ankara University – Mozambique Translator",
        short_name: "TİKA MZ",
        description:
          "Real-time multilingual interpretation and communication platform for cooperation between TİKA, Ankara University, and Mozambique. Turkish, Portuguese, and English.",
        theme_color: "#002855",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2,jpg}"],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/ws/, /\.[a-z0-9]+$/i],
        runtimeCaching: [{ urlPattern: /\/api(\/|$)/, handler: "NetworkOnly" as const }],
      },
    }),
  ],
});
