import type { FastifyRequest } from "fastify";
import type { ServerEnv } from "./env.js";

/**
 * Die oeffentliche Wurzel des Servers, ohne abschliessenden Schraegstrich.
 *
 * Bewusst aus der Anfrage abgeleitet: der Server steht mal unter `localhost:3200`, mal
 * hinter Caddy unter `axon-editor.sliplane.app`, und ein fest eingetragener Wert waere
 * genau einmal richtig. `trustProxy` steht in `app.ts`, deshalb traegt `req.protocol`
 * bereits `x-forwarded-proto`.
 *
 * `PUBLIC_BASE_URL` schlaegt den Host-Kopf: der ist Nutzerdaten, und ein untergeschobener
 * Aufruf bekaeme sonst Links auf eine fremde Domain (Sicherheitsaudit 11.08.2026).
 *
 * Stand hier dreimal fast gleich: bei den Download-Links des MCP-Zugangs, bei der
 * Basis-Adresse des Repositories und, seit der Absicherung, in den OAuth-Metadaten. Beim
 * dritten Mal gehoert es an eine Stelle. Die Metadaten sind der Grund, warum es genau
 * gleich sein **muss**: weicht die dort genannte `resource` von der Adresse ab, unter der
 * der Zugang wirklich steht, verweigert der Klient die Verbindung.
 */
export function wurzelVon(req: FastifyRequest, env: ServerEnv): string {
  if (env.publicBaseUrl !== null) return env.publicBaseUrl;
  return `${req.protocol}://${req.headers.host ?? "localhost"}`;
}
