import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database, { type Database as SqliteDatabase } from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export type Db = BetterSQLite3Database<typeof schema>;

/** Die Instanz innerhalb einer Transaktion. Dieselben Abfragen, andere Klasse. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Oeffnet die SQLite-Datei und setzt die PRAGMAs, auf die sich der Rest verlaesst.
 *
 * `foreign_keys` ist in SQLite je Verbindung aus. Ohne dieses PRAGMA greift kein
 * ON DELETE CASCADE, und ein geloeschtes Projekt liesse seine Submodels als Waisen zurueck.
 */
export function openDatabase(path: string): { db: Db; sqlite: SqliteDatabase } {
  mkdirSync(dirname(path), { recursive: true });

  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");

  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}
