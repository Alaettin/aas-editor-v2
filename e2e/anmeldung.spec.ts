import { expect, test } from "@playwright/test";

/**
 * Die Anmeldung.
 *
 * Bis zum 08.08.2026 stand hier eine eigene Markenflaeche mit Canvas-Keyvisual, und die
 * Tests pruefften deren Geometrie, ihr Stillstehen bei reduzierter Bewegung und den Blitz
 * an der Karte. Die Flaeche ist weg; geprueft wird jetzt, dass die Seite die Marke und das
 * Formular zeigt, dass gar keine Animation mehr laeuft und dass die Sprache am Knopf
 * ablesbar ist.
 *
 * Das Anmelden selbst deckt `oberflaeche.spec.ts` ab, dort haengt jeder Test am
 * Anmeldehelfer.
 */

test.describe("Anmeldung", () => {
  test("zeigt Marke und Formular, ohne Konsolenfehler", async ({ page }) => {
    const fehler: string[] = [];
    page.on("pageerror", (e) => fehler.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("Failed to load resource")) {
        fehler.push(m.text());
      }
    });

    await page.goto("/login");

    // Die Marke ist seit dem 08.08.2026 ein Bild, das Zeichen, Wortmarke und Produktnamen
    // in einem Stueck traegt. Geprueft wird, dass es auch wirklich geladen ist.
    const marke = page.getByRole("img", { name: "AXON Editor" });
    await expect(marke).toBeVisible();
    await expect
      .poll(() => marke.evaluate((bild: HTMLImageElement) => bild.naturalWidth))
      .toBeGreaterThan(0);
    await expect(page.locator("form")).toBeVisible();

    // Keine Hintergrundanimation mehr: die Seite traegt kein Canvas.
    await expect(page.locator("canvas")).toHaveCount(0);

    expect(fehler).toEqual([]);
  });

  test("zeigt am Sprachknopf, welche Sprache gilt", async ({ page }) => {
    await page.goto("/login");

    const knopf = page.getByRole("button", { name: /English|Deutsch/ });
    await expect(knopf).toHaveText(/DE|EN/);

    const vorher = (await knopf.textContent())?.trim();
    await knopf.click();
    await expect(page.getByRole("button", { name: /English|Deutsch/ })).not.toHaveText(
      vorher ?? "",
    );
  });

  test("steht auf der Flaeche des Editors", async ({ page }) => {
    await page.goto("/login");

    const grund = await page.evaluate(() => {
      const flaeche = document.querySelector("main");
      return flaeche ? getComputedStyle(flaeche).backgroundColor : null;
    });
    // --background der Rampe, dieselbe Farbe wie im Editor und auf dem Einstieg.
    expect(grund).toBe("rgb(10, 36, 80)");
  });
});
