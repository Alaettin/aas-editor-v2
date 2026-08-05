import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

import pkg from "./package.json" with { type: "json" };
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Die Fassung steht in genau einer Datei und wird von dort durchgereicht. Ein Import
  // der package.json im Komponentencode wuerde die ganze Abhaengigkeitsliste mitbuendeln.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [react(), tailwindcss()],
  worker: {
    // ES-Worker, damit die dynamischen Importe im Worker auch im Build getrennte Chunks
    // bleiben: xmlization und verification sollen erst laden, wenn sie gebraucht werden
    // (Plan Abschnitt 10).
    format: "es",
  },
  build: {
    // Fuer die Budget-Pruefung in scripts/check-bundle-budget.mjs
    manifest: true,
    target: "es2022",
  },
  server: {
    port: 5273,
    proxy: {
      "/api": {
        target: "http://localhost:3200",
        changeOrigin: true,
      },
    },
  },
});
