import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Db } from "../db/client.js";

export function healthRoutes(app: FastifyInstance, db: Db): void {
  app.get("/api/health", () => {
    // Ein echter Zugriff, nicht nur "der Prozess laeuft": der Healthcheck im Compose
    // soll anschlagen, wenn das Volume fehlt oder die Datei nicht lesbar ist.
    db.get(sql`select 1`);
    // Die Fassung steht in der package.json des Servers. Sie hier abzuschreiben ging bis
    // zum 06.08.2026 gut, weil beide auf 0.1.0 standen; seit alle Pakete auf 1.0.0 sind,
    // meldete der Health-Endpunkt als einziger noch die alte Zahl.
    return { status: "ok", version: __APP_VERSION__, metamodel: "3.1", db: "ok" };
  });
}
