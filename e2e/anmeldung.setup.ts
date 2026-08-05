import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test as setup } from "@playwright/test";

/**
 * Meldet sich einmal an und legt die Sitzung ab.
 *
 * Grund: der Server begrenzt die Anmeldung auf zehn Versuche je Viertelstunde, und das
 * ist richtig so. Meldete sich jede Pruefung selbst an, sperrte die Abnahme sich nach
 * zwei Durchlaeufen selbst aus, und der naechste rote Lauf haette nichts mit dem Code zu
 * tun. Genau das ist mehrfach passiert.
 *
 * `anmeldung.spec.ts` laeuft bewusst **ohne** diese Sitzung: dort ist die Anmeldung der
 * Gegenstand der Pruefung, kein Vorspiel.
 *
 * Nebenbei wird hier die **Sprache festgenagelt**. Seit es Englisch gibt, richtet sich die
 * Vorgabe nach dem Browser, und Chromium meldet `en-US`. Ohne diese Zeile liefe die ganze
 * Abnahme auf Englisch und jeder Selektor auf deutschen Text ginge ins Leere, ohne dass am
 * Programm etwas falsch waere. Die englische Fassung prueft `oberflaeche.spec.ts` eigens.
 */

export const SITZUNG = fileURLToPath(new URL("./.auth/sitzung.json", import.meta.url));

const ENV = Object.fromEntries(
  readFileSync(fileURLToPath(new URL("../.env", import.meta.url)), "utf8")
    .split(/\r?\n/)
    .filter((zeile) => zeile.includes("=") && !zeile.startsWith("#"))
    .map((zeile) => [
      zeile.slice(0, zeile.indexOf("=")).trim(),
      zeile.slice(zeile.indexOf("=") + 1).trim(),
    ]),
);

setup("anmelden", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() =>
    localStorage.setItem(
      "aas-editor-ansicht",
      JSON.stringify({ theme: "light", density: "cozy", language: "de" }),
    ),
  );
  await page.reload();
  await page.fill("#benutzer", ENV["AUTH_USERNAME"] ?? "");
  await page.fill("#passwort", ENV["AUTH_PASSWORD"] ?? "");
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/projekte");

  await page.context().storageState({ path: SITZUNG });
  expect(await page.evaluate(() => location.pathname)).toBe("/projekte");
});
