import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { installAuth } from "./auth/plugin.js";
import { openDatabase, type Db } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import type { ServerEnv } from "./env.js";
import { registerErrorHandler } from "./errors.js";
import { installiereSicherheitskopfzeilen } from "./sicherheitskopfzeilen.js";
import { assistentRoutes } from "./routes/assistent.js";
import { authRoutes } from "./routes/auth.js";
import { einstellungsRoutes } from "./routes/einstellungen.js";
import { healthRoutes } from "./routes/health.js";
import { fileRoutes } from "./routes/files.js";
import { mcpRoutes } from "./routes/mcp.js";
import { projectRoutes } from "./routes/projects.js";
import { repositoryRoutes } from "./routes/repository.js";
import { frontendVorhanden, statischeDateien } from "./routes/statisch.js";
import { submodelRoutes } from "./routes/submodels.js";

export interface BuiltServer {
  readonly app: FastifyInstance;
  readonly db: Db;
  readonly close: () => Promise<void>;
}

/**
 * Baut die Instanz, ohne zu lauschen. Das Lauschen liegt allein in index.ts, damit Tests
 * ueber app.inject() ohne Port und ohne Netzwerk laufen koennen.
 */
export async function buildServer(
  env: ServerEnv,
  migrationsFolder: string,
  frontendFolder?: string,
): Promise<BuiltServer> {
  const { db, sqlite } = openDatabase(env.dbPath);
  runMigrations(db, migrationsFolder);

  const app = Fastify({
    logger: {
      level: env.logLevel,
      redact: ["req.headers.cookie", "req.headers.authorization"],
    },
    /*
     * Genau **ein** vertrauter Sprung, nicht `true`.
     *
     * Ohne trustProxy saehe die Ratenbegrenzung hinter Caddy nur dessen Container-IP und
     * sperrte beim ersten Fehlversuch alle aus. Mit `true` aber vertraut Fastify jedem
     * Eintrag in `X-Forwarded-For`, und weil `req.ip` der Schluessel jeder Grenze ist, liesse
     * sich mit einer gefaelschten Kopfzeile jede Ratenbegrenzung frei drehen
     * (Sicherheitsaudit 11.08.2026, hoher Befund; lokal nachgemessen, dass die Eimer dann
     * auseinanderfallen). `1` traut genau dem einen Vorschalter: lokal Caddy, auf Sliplane
     * dessen Rand.
     */
    trustProxy: 1,
    bodyLimit: 64 * 1024 * 1024,
    /*
     * Der Router deckelt einen Pfadparameter von Haus aus auf **100 Zeichen**, und das ist
     * fuer diesen Server zu wenig: IDTA-01002 adressiert Identifiables base64url-kodiert,
     * und schon eine gewoehnliche Hersteller-IRI liegt kodiert weit darueber, die
     * Kodierung allein kostet ein Drittel. Der Aufruf endet dann mit **414** und
     * "is exceeding the max param length" statt mit dem Teilmodell.
     *
     * Aufgefallen am 11.08.2026 beim Entfernen eines Teilmodells aus dem Repository. Es
     * betrifft nicht nur das Repository, sondern seit jeher auch
     * `/api/projects/:id/submodels/:encodedId`; dort ist es nur nie jemandem
     * untergekommen, weil die Testkennungen kurz sind. Ein Test mit einer echten
     * Hersteller-IRI haelt es jetzt fest (`test/repository.test.ts`), und die Gegenprobe
     * ohne diese Zeile schlaegt mit 414 an.
     *
     * Unter `routerOptions`, nicht als Direktfeld: Fastify 5 warnt sonst mit FSTDEP022 und
     * entfernt den alten Weg in Fassung 6.
     */
    routerOptions: { maxParamLength: 2048 },
  });

  // Der SPA-Fallback haengt am 404-Handler, und den gibt es nur einmal je Instanz.
  const hatFrontend = frontendFolder !== undefined && frontendVorhanden(frontendFolder);
  registerErrorHandler(app, hatFrontend);
  installiereSicherheitskopfzeilen(app, env.production);
  await installAuth(app, env);
  await app.register(multipart, { limits: { fileSize: env.maxUploadBytes, files: 1 } });
  /*
   * Einmal hier, nicht in den Routendateien. `@fastify/rate-limit` ist ein fp-Plugin: es
   * traegt sich immer in die Wurzel ein, auch aus einem gekapselten Geltungsbereich heraus,
   * und ein zweites Mal scheitert an "already present". Ausserdem sieht sein onRoute-Haken
   * nur Routen, die **danach** angemeldet werden, also muss es vor allen stehen, die
   * `config.rateLimit` setzen. `global: false` heisst: es gilt nur, wo es dranschreibt.
   */
  await app.register(rateLimit, { global: false });

  healthRoutes(app, db);
  authRoutes(app, db, env);
  projectRoutes(app, db);
  fileRoutes(app, db, env);
  submodelRoutes(app, db);
  repositoryRoutes(app, db, env);
  einstellungsRoutes(app, db, env);
  assistentRoutes(app, db, env);
  // Ohne requireAuth und ohne db: der MCP-Zugang ist eine Werkbank ueber
  // @aas-editor/core, kein Fernzugriff auf die Ablage. Siehe routes/mcp.ts.
  await mcpRoutes(app, env);

  // Zuletzt, damit keine API-Route verdeckt wird.
  if (hatFrontend) await statischeDateien(app, frontendFolder as string);
  else app.log.info("kein gebautes Frontend gefunden, Server laeuft als reine API");

  return {
    app,
    db,
    close: async () => {
      await app.close();
      sqlite.close();
    },
  };
}
