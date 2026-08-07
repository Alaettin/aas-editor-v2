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
 * Seit dem 07.08.2026 gibt es **zwei Wege** herein, und diese Datei kann beide. Welchen
 * sie nimmt, entscheidet `AUTH_MODE` in der `.env`, nicht eine Annahme hier:
 *
 *   passwort  Formular ausfuellen, wie bisher.
 *   oidc      Ueber AXON Studio. Der Browser wandert dabei auf eine **fremde Herkunft**
 *             und wieder zurueck; Playwright folgt dem von selbst, es braucht nur die
 *             Zugangsdaten eines Hub-Kontos (HUB_TEST_EMAIL, HUB_TEST_PASSWORT).
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
    localStorage.setItem("aas-editor-ansicht", JSON.stringify({ density: "cozy", language: "de" })),
  );
  await page.reload();

  if ((ENV["AUTH_MODE"] ?? "passwort") === "oidc") {
    const mail = ENV["HUB_TEST_EMAIL"];
    const passwort = ENV["HUB_TEST_PASSWORT"];
    if (!mail || !passwort) {
      throw new Error(
        "AUTH_MODE=oidc, aber HUB_TEST_EMAIL oder HUB_TEST_PASSWORT fehlt in der .env. " +
          "Ohne ein Konto beim Hub kann sich die Abnahme nicht anmelden.",
      );
    }

    await page.getByRole("link", { name: /AXON Studio/ }).click();

    // Ab hier steht der Browser beim Hub. Dessen Anmeldung, nicht unsere.
    await page.waitForURL(/axon-studio\.sliplane\.app/, { timeout: 30_000 });
    await page.getByLabel("E-Mail").fill(mail);
    await page.getByLabel("Passwort").fill(passwort);
    await page.getByRole("button", { name: "Anmelden" }).click();

    /*
     * Danach kommen zwei moegliche Bilder, und beide sind richtig: beim ersten Mal fragt
     * der Hub nach Zustimmung, danach reicht er durch. Eine Abnahme, die den Knopf
     * voraussetzt, ist ab dem zweiten Lauf rot, ohne dass etwas kaputt waere.
     */
    const erlauben = page.getByRole("button", { name: "Erlauben" });
    await Promise.race([
      erlauben.waitFor({ state: "visible", timeout: 20_000 }).catch(() => undefined),
      page.waitForURL(/localhost:5273\/projekte/, { timeout: 20_000 }).catch(() => undefined),
    ]);
    if (await erlauben.count()) await erlauben.click();
  } else {
    await page.fill("#benutzer", ENV["AUTH_USERNAME"] ?? "");
    await page.fill("#passwort", ENV["AUTH_PASSWORD"] ?? "");
    await page.click('button[type="submit"]');
  }

  await page.waitForFunction(() => location.pathname === "/projekte", undefined, {
    timeout: 30_000,
  });

  await page.context().storageState({ path: SITZUNG });
  expect(await page.evaluate(() => location.pathname)).toBe("/projekte");
});
