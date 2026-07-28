#!/usr/bin/env node
/**
 * Wachhund fuer das Performance-Budget aus Plan Abschnitt 10:
 * das initiale JavaScript-Bundle bleibt unter 250 KB gzip.
 *
 * Gezaehlt wird nur, was fuer den ersten Aufbau tatsaechlich geladen wird, also der
 * Einstiegs-Chunk und seine statischen Importe. Dynamische Importe (xmlization, die
 * 3.0-SDK, der Worker) zaehlen bewusst nicht mit, genau dafuer sind sie ausgelagert.
 */
import { gzipSync } from "node:zlib";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "apps/web/dist");
const manifestPath = join(distDir, ".vite/manifest.json");

const BUDGET_BYTES = 250 * 1024;

if (!existsSync(manifestPath)) {
  console.error(`Kein Build gefunden: ${manifestPath}\nZuerst 'pnpm --filter @aas-editor/web build' laufen lassen.`);
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

let total = 0;
const rows = [];
for (const key of initial) {
  const entry = manifest[key];
  if (!entry.file.endsWith(".js")) continue;
  const bytes = gzipSync(readFileSync(join(distDir, entry.file))).length;
  total += bytes;
  rows.push({ file: entry.file, gzip: bytes });
}

rows.sort((a, b) => b.gzip - a.gzip);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

console.log("Initiales JavaScript, gzip:\n");
for (const row of rows) console.log(`  ${kb(row.gzip).padStart(9)}  ${row.file}`);
console.log(`\n  ${kb(total).padStart(9)}  gesamt (Budget ${kb(BUDGET_BYTES)})`);

if (total > BUDGET_BYTES) {
  console.error(
    `\nBudget gerissen um ${kb(total - BUDGET_BYTES)}. Plan Abschnitt 10: xmlization, verification` +
      ` und die 3.0-SDK gehoeren hinter dynamische Importe, nie den Wurzelimport der SDK nutzen.`,
  );
  process.exit(1);
}

console.log(`\nBudget eingehalten, ${kb(BUDGET_BYTES - total)} Luft.`);
