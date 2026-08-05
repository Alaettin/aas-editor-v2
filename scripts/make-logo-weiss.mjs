#!/usr/bin/env node
/**
 * Bereitet das Neoception-Logo fuer die dunkle Buehne der Anmeldung auf.
 *
 * Die Vorlage ist freigestellt und traegt drei Farben: das gruene Viereck, das
 * ausgesparte "NEO" in Weiss und den uebrigen Schriftzug in Schwarz. Auf Blau muss das
 * Schwarz zu Weiss werden, sonst verschwindet der halbe Schriftzug. Dazu hat die Vorlage
 * viel Luft, die hier abgeschnitten wird.
 *
 *   node scripts/make-logo-weiss.mjs <pfad-zur-vorlage.png>
 *
 * Gerechnet wird im Browser auf einem Canvas: Playwright liegt ohnehin im Projekt, und
 * eine Bildbibliothek fuer einen einmaligen Schnitt waere eine Abhaengigkeit zu viel.
 * Das Ergebnis liegt als `apps/web/src/assets/neoception-weiss.png` im Repo; dieses
 * Skript steht daneben, damit der Schritt nachvollziehbar und wiederholbar ist.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const ZIEL = join(WURZEL, "apps/web/src/assets/neoception-weiss.png");

const quelle = process.argv[2];
if (!quelle) {
  console.error("Aufruf: node scripts/make-logo-weiss.mjs <vorlage.png>");
  process.exit(1);
}

const daten = `data:image/png;base64,${readFileSync(quelle).toString("base64")}`;

const browser = await chromium.launch();
const seite = await browser.newPage();

const ergebnis = await seite.evaluate(async (quelldaten) => {
  const bild = new Image();
  await new Promise((fertig, fehler) => {
    bild.onload = () => fertig();
    bild.onerror = () => fehler(new Error("Bild nicht lesbar"));
    bild.src = quelldaten;
  });

  const c = document.createElement("canvas");
  c.width = bild.width;
  c.height = bild.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bild, 0, 0);

  const bd = ctx.getImageData(0, 0, c.width, c.height);
  const px = bd.data;

  let links = c.width;
  let rechts = -1;
  let oben = c.height;
  let unten = -1;

  for (let i = 0; i < c.width * c.height; i += 1) {
    if (px[i * 4 + 3] < 16) continue;

    // Schwarz wird Weiss. Gruen und das ausgesparte NEO bleiben unberuehrt. Die Schwelle
    // liegt hoch genug, dass auch die weichen Kanten der Buchstaben mitwandern.
    if (px[i * 4] < 130 && px[i * 4 + 1] < 130 && px[i * 4 + 2] < 130) {
      px[i * 4] = 255;
      px[i * 4 + 1] = 255;
      px[i * 4 + 2] = 255;
    }

    const x = i % c.width;
    const y = (i - x) / c.width;
    if (x < links) links = x;
    if (x > rechts) rechts = x;
    if (y < oben) oben = y;
    if (y > unten) unten = y;
  }
  ctx.putImageData(bd, 0, 0);

  const breite = rechts - links + 1;
  const hoehe = unten - oben + 1;
  const zu = document.createElement("canvas");
  zu.width = breite;
  zu.height = hoehe;
  zu.getContext("2d").drawImage(c, links, oben, breite, hoehe, 0, 0, breite, hoehe);

  return { bild: zu.toDataURL("image/png"), breite, hoehe, quelle: [c.width, c.height] };
}, daten);

writeFileSync(ZIEL, Buffer.from(ergebnis.bild.split(",")[1], "base64"));
console.log(`${ergebnis.quelle.join("x")} zugeschnitten auf ${ergebnis.breite}x${ergebnis.hoehe}`);
console.log(ZIEL);
await browser.close();
