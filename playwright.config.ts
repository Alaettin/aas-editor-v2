import { defineConfig, devices } from "@playwright/test";

/**
 * Browserabnahme der Oberflaeche.
 *
 * Bewusst wenige Pruefungen, dafuer solche, die sich nicht im Vitest nachbilden lassen:
 * Rahmenhoehen, Sichtwechsel, Erscheinungswechsel und die Zusicherung, dass der Assistent
 * ohne Anbindung auch als solcher erkennbar bleibt.
 *
 * Voraussetzung ist ein laufender Entwicklungsbetrieb (`pnpm dev` und `pnpm dev:server`)
 * mit einer ausgefuellten `.env`. Beim ersten Lauf einmal
 * `pnpm exec playwright install chromium` ausfuehren.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5273",
    viewport: { width: 1440, height: 900 },
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
