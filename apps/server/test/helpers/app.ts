import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../src/app.js";
import type { Db } from "../../src/db/client.js";
import { readEnv, type ServerEnv } from "../../src/env.js";

/**
 * Baut eine Instanz gegen eine echte SQLite-Datei in einem Wegwerfverzeichnis.
 *
 * Bewusst nicht :memory:. WAL, Fremdschluessel und die Migrationen sollen genauso laufen
 * wie im Betrieb, sonst prueft der Test etwas anderes als das, was ausgeliefert wird.
 */

export const BENUTZER = "pruefer";
export const PASSWORT = "geheim-genug";

const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));

export interface TestServer {
  readonly app: FastifyInstance;
  readonly env: ServerEnv;
  /**
   * Direkter Zugriff auf die Ablage. Gebraucht fuer Zusagen, die sich ueber die
   * Schnittstelle nicht pruefen lassen: dass eine gemerkte Zahl wirklich gemerkt ist und
   * nicht jedes Mal neu gerechnet wird, sieht man nur, wenn man sie unterschiebt.
   */
  readonly db: Db;
  readonly cookie: string;
  readonly close: () => Promise<void>;
}

export async function startTestServer(overrides: Record<string, string> = {}): Promise<TestServer> {
  const dir = mkdtempSync(join(tmpdir(), "aas-editor-test-"));
  const env = readEnv({
    AUTH_USERNAME: BENUTZER,
    AUTH_PASSWORD: PASSWORT,
    SESSION_SECRET: "test-geheimnis-lang-genug",
    DATA_DIR: dir,
    LOG_LEVEL: "silent",
    ...overrides,
  } as NodeJS.ProcessEnv);

  const built = await buildServer(env, MIGRATIONS);
  const cookie = await anmelden(built.app);

  return {
    app: built.app,
    env,
    db: built.db,
    cookie,
    close: async () => {
      await built.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function anmelden(app: FastifyInstance): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { benutzer: BENUTZER, passwort: PASSWORT },
  });
  const raw = response.headers["set-cookie"];
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (first === undefined) throw new Error("Keine Sitzung erhalten.");
  return first.split(";")[0] ?? "";
}

export function dataPath(env: ServerEnv, ...parts: string[]): string {
  return resolve(env.dataDir, ...parts);
}
