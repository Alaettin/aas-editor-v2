import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

/**
 * Browserabnahme der Oberflaeche.
 *
 * Bewusst wenige Pruefungen, dafuer solche, die sich nicht im Vitest nachbilden lassen:
 * Rahmenhoehen, Sichtwechsel, Erscheinungswechsel, gemessene Zeiten und die Zusicherung,
 * dass der Assistent ohne Anbindung auch als solcher erkennbar bleibt.
 *
 * Voraussetzung ist ein laufender Entwicklungsbetrieb (`pnpm dev` und `pnpm dev:server`)
 * mit einer ausgefuellten `.env`. Beim ersten Lauf einmal
 * `pnpm exec playwright install chromium` ausfuehren.
 *
 * Drei Projekte statt einem: `einrichtung` meldet sich **einmal** an und legt die Sitzung
 * ab, `oberflaeche` erbt sie. Ohne das sperrte die Abnahme sich nach zwei Durchlaeufen
 * selbst aus, denn der Server erlaubt zehn Anmeldungen je Viertelstunde. `anmeldung`
 * laeuft ohne Sitzung, dort ist die Anmeldung selbst der Gegenstand.
 */

const SITZUNG = fileURLToPath(new URL("./e2e/.auth/sitzung.json", import.meta.url));

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
  projects: [
    {
      name: "einrichtung",
      testMatch: /anmeldung\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "anmeldung",
      testMatch: /anmeldung\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "oberflaeche",
      testIgnore: /anmeldung\.(spec|setup)\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: SITZUNG },
      dependencies: ["einrichtung"],
    },
  ],
});
