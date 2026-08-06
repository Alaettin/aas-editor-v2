import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";

/**
 * Sicherung der Daten: die Datenbank und die Anhaenge.
 *
 * **Die Datei nicht einfach kopieren.** SQLite laeuft hier mit WAL: der juengste Stand
 * liegt dann teilweise in `aas-editor.db-wal` und noch nicht in der Datei selbst. Eine
 * blanke Kopie kann deshalb einen Stand ergeben, der so nie existiert hat. `db.backup()`
 * macht dasselbe online und konsistent, waehrend der Server weiterlaeuft.
 *
 * Liegt in `apps/server/scripts` und nicht in `scripts/` an der Wurzel: `better-sqlite3`
 * ist eine Abhaengigkeit dieses Pakets, und pnpm legt sie nur dort ab.
 *
 * Aufruf im Container:
 *   docker compose exec app node apps/server/scripts/backup.mjs
 * Lokal:
 *   node apps/server/scripts/backup.mjs            (nimmt DATA_DIR oder ./data)
 *   node apps/server/scripts/backup.mjs /pfad/dir  (nimmt diesen Ordner)
 *
 * Das Ergebnis liegt unter `<DATA_DIR>/backups/<zeitstempel>/`. Es aus dem Volume zu holen
 * ist dann wirklich ein Kopiervorgang.
 */

const datenDir = resolve(process.argv[2] ?? process.env.DATA_DIR ?? "./data");
const dbPfad = join(datenDir, "aas-editor.db");
const anhaenge = join(datenDir, "attachments");

if (!existsSync(dbPfad)) {
  console.error(`Keine Datenbank unter ${dbPfad}. Falscher DATA_DIR?`);
  process.exit(1);
}

// Sortierbarer Zeitstempel ohne Doppelpunkte: die sind in Windows-Dateinamen verboten.
const stempel = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const ziel = join(datenDir, "backups", stempel);
mkdirSync(ziel, { recursive: true });

const db = new Database(dbPfad, { readonly: true });
try {
  await db.backup(join(ziel, "aas-editor.db"));
} finally {
  db.close();
}

if (existsSync(anhaenge)) {
  cpSync(anhaenge, join(ziel, "attachments"), { recursive: true });
}

console.log(`Sicherung abgelegt: ${ziel}`);
