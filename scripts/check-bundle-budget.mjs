#!/usr/bin/env node
/**
 * Wachhund fuer das Performance-Budget aus Plan Abschnitt 10:
 * das initiale JavaScript-Bundle bleibt unter 250 KB gzip.
 *
 * Gezaehlt wird nur, was fuer den ersten Aufbau tatsaechlich geladen wird, also der
 * Einstiegs-Chunk und seine statischen Importe. Dynamische Importe (xmlization, die
 * 3.0-SDK, der Worker) zaehlen bewusst nicht mit, genau dafuer sind sie ausgelagert.
 *
 * Das Stylesheet bekommt ein **eigenes** Budget. Es blockiert den ersten Bildaufbau
 * genauso wie das JavaScript, gehoert aber nicht in dieselbe Zahl: sonst verschiebt eine
 * neue Regel ploetzlich die Grenze fuer den Code.
 *
 * Die Bruchstuecke des Workers stehen nicht im Manifest, Vite fuehrt sie getrennt. Sie
 * werden deshalb aus dem Ausgabeordner gelesen und nur **aufgelistet**, ohne Grenze: sie
 * laden nachtraeglich und blockieren nichts. Sichtbar sollen sie trotzdem sein, sonst
 * waechst dort unbemerkt ein Brocken wie elkjs mit seinen 456 KB.
 */
import { gzipSync } from "node:zlib";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "apps/web/dist");
const manifestPath = join(distDir, ".vite/manifest.json");

const BUDGET_BYTES = 250 * 1024;
/** Das Stylesheet laedt renderblockierend mit. 40 KB gzip sind fuer eine Oberflaeche dieser
 *  Groesse reichlich, heute stehen 16 KB darin. */
const CSS_BUDGET_BYTES = 40 * 1024;

if (!existsSync(manifestPath)) {
  console.error(
    `Kein Build gefunden: ${manifestPath}\nZuerst 'pnpm --filter @aas-editor/web build' laufen lassen.`,
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

/** Einstiegspunkte und alles, was sie statisch nachziehen. */
const initial = new Set();
const walk = (key) => {
  if (initial.has(key)) return;
  const entry = manifest[key];
  if (!entry) return;
  initial.add(key);
  for (const imported of entry.imports ?? []) walk(imported);
};
for (const [key, entry] of Object.entries(manifest)) {
  if (entry.isEntry) walk(key);
}

const gzipVon = (datei) => gzipSync(readFileSync(join(distDir, datei))).length;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

let total = 0;
let cssTotal = 0;
const rows = [];
const cssRows = [];
/** Alles, was aus dem Manifest bekannt ist: der Rest im Ordner gehoert dem Worker. */
const bekannt = new Set();

for (const entry of Object.values(manifest)) {
  bekannt.add(entry.file);
  for (const datei of entry.css ?? []) bekannt.add(datei);
}

for (const key of initial) {
  const entry = manifest[key];
  for (const datei of entry.css ?? []) {
    if (cssRows.some((row) => row.file === datei)) continue;
    const bytes = gzipVon(datei);
    cssTotal += bytes;
    cssRows.push({ file: datei, gzip: bytes });
  }
  if (!entry.file.endsWith(".js")) continue;
  const bytes = gzipVon(entry.file);
  total += bytes;
  rows.push({ file: entry.file, gzip: bytes });
}

rows.sort((a, b) => b.gzip - a.gzip);
cssRows.sort((a, b) => b.gzip - a.gzip);

console.log("Initiales JavaScript, gzip:\n");
for (const row of rows) console.log(`  ${kb(row.gzip).padStart(9)}  ${row.file}`);
console.log(`\n  ${kb(total).padStart(9)}  gesamt (Budget ${kb(BUDGET_BYTES)})`);

console.log("\nStylesheet, gzip, laedt renderblockierend mit:\n");
for (const row of cssRows) console.log(`  ${kb(row.gzip).padStart(9)}  ${row.file}`);
console.log(`\n  ${kb(cssTotal).padStart(9)}  gesamt (Budget ${kb(CSS_BUDGET_BYTES)})`);

// Der Worker und alles, was er nachlaedt. Ohne Grenze, aber nicht unsichtbar.
const assetsDir = join(distDir, "assets");
const workerRows = existsSync(assetsDir)
  ? readdirSync(assetsDir)
      .map((name) => `assets/${name}`)
      .filter((datei) => datei.endsWith(".js") && !bekannt.has(datei))
      .map((datei) => ({ file: datei, gzip: gzipVon(datei) }))
      .sort((a, b) => b.gzip - a.gzip)
  : [];

if (workerRows.length > 0) {
  const workerTotal = workerRows.reduce((summe, row) => summe + row.gzip, 0);
  console.log("\nWorker, gzip, laedt erst bei Bedarf, kein Budget:\n");
  for (const row of workerRows) console.log(`  ${kb(row.gzip).padStart(9)}  ${row.file}`);
  console.log(`\n  ${kb(workerTotal).padStart(9)}  gesamt`);
}

let gerissen = false;

if (total > BUDGET_BYTES) {
  gerissen = true;
  console.error(
    `\nJavaScript-Budget gerissen um ${kb(total - BUDGET_BYTES)}. Plan Abschnitt 10: xmlization,` +
      ` verification und die 3.0-SDK gehoeren hinter dynamische Importe, nie den Wurzelimport` +
      ` der SDK nutzen.`,
  );
}

if (cssTotal > CSS_BUDGET_BYTES) {
  gerissen = true;
  console.error(
    `\nStylesheet-Budget gerissen um ${kb(cssTotal - CSS_BUDGET_BYTES)}. Die Oberflaeche laeuft` +
      ` auf einem Token-Satz: neue Werte gehoeren in tokens.css, nicht als weitere Regeln daneben.`,
  );
}

if (gerissen) process.exit(1);

console.log(
  `\nBeide Budgets eingehalten: ${kb(BUDGET_BYTES - total)} Luft beim JavaScript,` +
    ` ${kb(CSS_BUDGET_BYTES - cssTotal)} beim Stylesheet.`,
);
