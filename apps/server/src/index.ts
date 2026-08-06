import { fileURLToPath } from "node:url";
import { buildServer } from "./app.js";
import { readEnv } from "./env.js";

/**
 * Einstiegspunkt: Umgebung lesen, Server bauen, lauschen. Sonst nichts.
 *
 * Migrations- und Frontendordner werden hier aufgeloest, weil nur diese Datei in beiden
 * Faellen genau eine Ebene unter apps/server liegt: als src/index.ts im
 * Entwicklungsbetrieb und als gebuendeltes dist/index.js im Container.
 */

// Die .env liegt im Wurzelverzeichnis des Repos. Im Container kommt die Umgebung aus
// Compose, dort gibt es keine Datei und das ist kein Fehler.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // absichtlich still
}

// Im Entwicklungsbetrieb laeuft der Server ueber tsx, dort ersetzt niemand `__APP_VERSION__`.
(globalThis as Record<string, unknown>)["__APP_VERSION__"] ??= "dev";

const env = readEnv();
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
// Dieselbe Rechnung wie beim Migrationsordner: nur diese Datei liegt in beiden Faellen
// genau eine Ebene unter apps/server, als src/index.ts wie als dist/index.js.
const frontendFolder = fileURLToPath(new URL("../../web/dist", import.meta.url));

const { app } = await buildServer(env, migrationsFolder, frontendFolder);

app.listen({ port: env.port, host: env.host }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
