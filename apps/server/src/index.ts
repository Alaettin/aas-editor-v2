import { fileURLToPath } from "node:url";
import { buildServer } from "./app.js";
import { readEnv } from "./env.js";

/**
 * Einstiegspunkt: Umgebung lesen, Server bauen, lauschen. Sonst nichts.
 *
 * Der Migrationsordner wird hier aufgeloest, weil nur diese Datei in beiden Faellen genau
 * eine Ebene unter apps/server liegt: als src/index.ts im Entwicklungsbetrieb und als
 * gebuendeltes dist/index.js im Container.
 */

// Die .env liegt im Wurzelverzeichnis des Repos. Im Container kommt die Umgebung aus
// Compose, dort gibt es keine Datei und das ist kein Fehler.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // absichtlich still
}

const env = readEnv();
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

const { app } = await buildServer(env, migrationsFolder);

app.listen({ port: env.port, host: env.host }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
