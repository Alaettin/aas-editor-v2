import { expect, test } from "@playwright/test";

/**
 * Die Anmeldebuehne.
 *
 * Geprueft wird, was sich nur im Browser zeigt: dass das Keyvisual tatsaechlich zeichnet,
 * dass es bei reduzierter Bewegung wirklich stillsteht, dass es auf schmalen Fenstern gar
 * nicht erst entsteht, und dass die Buehne von der Dunkelklasse unberuehrt bleibt.
 *
 * Die Anmeldung selbst deckt `oberflaeche.spec.ts` ab, dort haengt jeder Test am
 * Anmeldehelfer.
 */

/** Die Szene fuellt die Hoehe, siehe `ansichtFuer` in geometry.ts. */
const ENTWURF_HOEHE = 900;
const MIN_BREITE = 1250;
/** Der Knoten sitzt immer bei 37,5 Prozent der virtuellen Breite. */
const KNOTEN_ANTEIL = 0.375;

test.describe("Anmeldung", () => {
  test("zeichnet das Keyvisual, ohne Konsolenfehler", async ({ page }) => {
    const fehler: string[] = [];
    page.on("pageerror", (e) => fehler.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("Failed to load resource")) {
        fehler.push(m.text());
      }
    });

    await page.goto("/login");
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(700);

    const messung = await page.evaluate(
      ([hoeheEntwurf, minBreite, anteil]) => {
        const c = document.querySelector("canvas");
        const ctx = c?.getContext("2d");
        if (!c || !ctx) return null;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let skala = c.clientHeight / hoeheEntwurf;
        if (c.clientWidth / skala < minBreite) skala = c.clientWidth / minBreite;
        const breite = c.clientWidth / skala;
        const versatzY = (c.clientHeight / skala - hoeheEntwurf) / 2;

        const x = Math.round(breite * anteil * skala * dpr);
        const y = Math.round((hoeheEntwurf / 2 + versatzY) * skala * dpr);
        const daten = ctx.getImageData(x, y, 1, 1).data;
        return { breite: c.width, hoehe: c.height, pixel: [daten[0], daten[1], daten[2]] };
      },
      [ENTWURF_HOEHE, MIN_BREITE, KNOTEN_ANTEIL],
    );

    expect(messung).not.toBeNull();
    expect(messung!.breite).toBeGreaterThan(0);
    expect(messung!.hoehe).toBeGreaterThan(0);
    // Am Knoten steht Weiss. Damit ist belegt, dass wirklich gezeichnet wurde und die
    // Geometrie dort liegt, wo sie liegen soll.
    for (const kanal of messung!.pixel) expect(kanal).toBeGreaterThan(230);

    expect(fehler).toEqual([]);
  });

  test("steht bei reduzierter Bewegung still", async ({ browser }) => {
    const kontext = await browser.newContext({ reducedMotion: "reduce" });
    const seite = await kontext.newPage();
    await seite.goto("/login");
    await seite.waitForTimeout(500);

    const erst = await seite.evaluate(() => document.querySelector("canvas")?.toDataURL());
    await seite.waitForTimeout(600);
    const dann = await seite.evaluate(() => document.querySelector("canvas")?.toDataURL());

    expect(erst).toBeDefined();
    // Nicht leer: es wurde ein Standbild gezeichnet, und zwar genau eines.
    expect(erst!.length).toBeGreaterThan(2000);
    expect(dann).toBe(erst);

    await kontext.close();
  });

  test("laesst das Keyvisual auf schmalen Fenstern weg", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");

    await expect(page.locator("canvas")).toHaveCount(0);

    const karte = await page.locator("form").boundingBox();
    expect(karte).not.toBeNull();
    expect(karte!.x + karte!.width / 2).toBeCloseTo(195, 0);
  });

  test("meldet ankommende Datenpakete an die Karte", async ({ page }) => {
    await page.goto("/login");

    // Ein Paket braucht seine Zeit ueber Strom und Schiene. Beobachtet wird, ob die Karte
    // ueberhaupt jemals einen Blitz sieht, nicht wann.
    const gesehen = await page
      .waitForFunction(
        () => {
          const karte = document.querySelector("form");
          const wert = karte?.style.getPropertyValue("--axon-blitz");
          return wert !== undefined && wert !== "" && Number.parseFloat(wert) > 0;
        },
        null,
        { timeout: 25000 },
      )
      .then(() => true)
      .catch(() => false);

    expect(gesehen).toBe(true);
  });

  test("bleibt von der Dunkelklasse unberuehrt", async ({ page }) => {
    // Nach dem Abmelden aus dem dunklen Editor klebt die Klasse noch an der Wurzel.
    await page.addInitScript(() => document.documentElement.classList.add("dark"));
    await page.goto("/login");

    const grund = await page.evaluate(() => {
      const flaeche = document.querySelector("main");
      return flaeche ? getComputedStyle(flaeche).backgroundColor : null;
    });
    expect(grund).toBe("rgb(24, 88, 176)");
  });
});
