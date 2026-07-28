import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
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
