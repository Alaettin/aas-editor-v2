import type { FastifyInstance } from "fastify";
import type { Db } from "../db/client.js";
import type { ServerEnv } from "../env.js";
import { lesen, loeschen, setzen } from "../services/assistentEinstellung.js";
import { besitzer } from "../services/projects.js";

/**
 * Die Einstellungen des Assistenten.
 *
 * Das GET liefert **nie** den Schluessel, nur ob einer liegt und seine letzten vier
 * Zeichen. Ein Feld, das den hinterlegten Schluessel zurueckgibt, damit die Maske ihn
 * anzeigen kann, ist der uebliche Weg, wie ein Geheimnis in ein Browserprotokoll geraet.
 */
export function einstellungsRoutes(app: FastifyInstance, db: Db, env: ServerEnv): void {
  app.register(async (scope) => {
    scope.addHook("preHandler", app.requireAuth);

    scope.get("/api/einstellungen/assistent", (req) => lesen(db, env, besitzer(req)));

    scope.put("/api/einstellungen/assistent", (req) => {
      const body = (req.body ?? {}) as { schluessel?: unknown; modell?: unknown };
      return setzen(db, env, besitzer(req), body);
    });

    scope.delete("/api/einstellungen/assistent", (req) => loeschen(db, env, besitzer(req)));
  });
}
