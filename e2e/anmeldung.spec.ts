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

/** x-Position des Knotens im Entwurf, siehe SZENE in geometry.ts. */
const KNOTEN_X = 540;
const ENTWURF_BREITE = 1600;

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
      ([knotenX, entwurfBreite]) => {
        const c = document.querySelector("canvas");
        const ctx = c?.getContext("2d");
        if (!c || !ctx) return null;
        const skala = (c.clientWidth / entwurfBreite) * Math.min(window.devicePixelRatio || 1, 2);
        const x = Math.round(c.width / 2 + (knotenX - entwurfBreite / 2) * skala);
        const y = Math.round(c.height / 2);
        const daten = ctx.getImageData(x, y, 1, 1).data;
        return { breite: c.width, hoehe: c.height, pixel: [daten[0], daten[1], daten[2]] };
      },
      [KNOTEN_X, ENTWURF_BREITE],
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
