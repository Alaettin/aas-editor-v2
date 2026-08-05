import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Db } from "../db/client.js";

export function healthRoutes(app: FastifyInstance, db: Db): void {
  app.get("/api/health", () => {
    // Ein echter Zugriff, nicht nur "der Prozess laeuft": der Healthcheck im Compose
    // soll anschlagen, wenn das Volume fehlt oder die Datei nicht lesbar ist.
    db.get(sql`select 1`);
    return { status: "ok", version: "0.1.0", metamodel: "3.1", db: "ok" };
  });
}
