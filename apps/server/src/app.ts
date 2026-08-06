import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { installAuth } from "./auth/plugin.js";
import { openDatabase, type Db } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import type { ServerEnv } from "./env.js";
import { registerErrorHandler } from "./errors.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { fileRoutes } from "./routes/files.js";
import { projectRoutes } from "./routes/projects.js";
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
    // Ohne trustProxy sieht die Ratenbegrenzung hinter Caddy nur dessen Container-IP
    // und sperrt beim ersten Fehlversuch alle aus.
    trustProxy: true,
    bodyLimit: 64 * 1024 * 1024,
  });

  // Der SPA-Fallback haengt am 404-Handler, und den gibt es nur einmal je Instanz.
  const hatFrontend = frontendFolder !== undefined && frontendVorhanden(frontendFolder);
  registerErrorHandler(app, hatFrontend);
  await installAuth(app, env);
  await app.register(multipart, { limits: { fileSize: env.maxUploadBytes, files: 1 } });

  healthRoutes(app, db);
  await authRoutes(app, env);
  projectRoutes(app, db);
  fileRoutes(app, db, env);
  submodelRoutes(app, db);

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
