import { defineConfig } from "drizzle-kit";

/**
 * Nur zum Erzeugen der Migrationen (`pnpm --filter @aas-editor/server migrations`).
 * Angewendet werden sie beim Start ueber src/db/migrate.ts, drizzle-kit liegt im
 * Container nicht vor.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
