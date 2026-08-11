import type { FastifyInstance, FastifyRequest } from "fastify";
import { wurzelVon } from "../basisUrl.js";
import type { ServerEnv } from "../env.js";
import { BEREICHE, METADATEN_PFAD } from "../mcp/zugang.js";

/**
 * Die Beschilderung fuer OAuth: das Dokument nach RFC 9728, das sagt, wer Token fuer
 * diesen Zugang ausstellt.
 *
 * **Ungeschuetzt, und das ist der Sinn.** Ein Klient liest es, *bevor* er ein Token hat;
 * eine Anmeldung davor waere ein Ring, der sich selbst beisst. Es steht nichts darin, was
 * nicht ohnehin oeffentlich ist: die Adresse des Zugangs und die des Hubs.
 *
 * Drei Dinge muessen genau stimmen, sonst scheitert die Verbindung stumm, und zwar
 * ausserhalb dieses Servers, wo nichts davon zu sehen ist:
 *
 *   1. `resource` muss buchstabengenau die Adresse sein, die der Nutzer im Dialog
 *      eintippt, Pfad eingeschlossen. Deshalb `wurzelVon` und nicht ein fester Wert.
 *   2. `authorization_servers` traegt **einen** Eintrag. Claude nimmt den ersten und
 *      weicht nicht auf spaetere aus.
 *   3. Kein `offline_access` in `scopes_supported`. Ein Erneuerungstoken ist der Wunsch
 *      des Klienten, kein Erfordernis der Ressource; Claude haengt es selbst an.
 *
 * Zwei Pfade, weil ein Klient auf zwei Wegen hierher findet: entweder ueber
 * `resource_metadata` aus der Aufforderung beim 401, dann ist es der lange Pfad mit dem
 * Anhang `/api/mcp`, oder blind ueber die Wurzel. Beide liefern dasselbe Dokument.
 */

function metadaten(req: FastifyRequest, env: ServerEnv): Record<string, unknown> {
  const wurzel = wurzelVon(req, env);
  return {
    resource: `${wurzel}/api/mcp`,
    authorization_servers: env.oidc === null ? [] : [env.oidc.aussteller],
    scopes_supported: BEREICHE.split(" "),
    bearer_methods_supported: ["header"],
    resource_name: "AXON Editor",
    resource_documentation: `${wurzel}/`,
  };
}

export function wohlbekannteRoutes(app: FastifyInstance, env: ServerEnv): void {
  for (const pfad of [METADATEN_PFAD, "/.well-known/oauth-protected-resource"]) {
    app.get(pfad, (req, reply) =>
      reply
        // Eine Stunde. Das Dokument aendert sich nur, wenn der Aussteller wechselt, und
        // dann ist eine Stunde Verzug hinnehmbar; ohne die Zeile fragt jede Verbindung neu.
        .header("cache-control", "public, max-age=3600")
        .send(metadaten(req, env)),
    );
  }
}
