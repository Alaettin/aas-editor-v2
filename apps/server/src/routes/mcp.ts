import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ServerEnv } from "../env.js";
import { baueMcpServer } from "../mcp/server.js";
import { abrufen, raeumeAuf } from "../services/ausgabe.js";

/**
 * Der MCP-Zugang, Streamable HTTP nach Protokollfassung 2025-03-26 und neuer.
 *
 * **Zustandslos**: je Anfrage ein frischer Server und ein frischer Transport, kein
 * Sitzungsspeicher. Das passt zum Zuschnitt der Werkzeuge, die ohnehin nichts zwischen
 * zwei Aufrufen behalten, und es erspart die Frage, wann eine Sitzung endet.
 *
 * `enableJsonResponse` liefert gewoehnliches JSON statt eines SSE-Stroms. Erlaubt ist
 * beides; ohne einen langlaufenden Aufruf, der Zwischenstaende meldet, ist der Strom nur
 * eine Verbindung, die offen bleibt, und ein Puls, den jemand pflegen muss.
 *
 * **Ohne Absicherung.** Wer die Adresse kennt, kann pruefen, umwandeln und Dateien
 * erzeugen. Projekte, Anhaenge und Einstellungen sind nicht erreichbar: die Werkzeuge
 * bekommen `db` gar nicht erst zu sehen. Gegen den verbleibenden Missbrauch stehen die
 * Ratenbegrenzung hier und die Groessengrenzen in `mcp/werkzeuge.ts`.
 */

/** Eine Runde kostet Rechenzeit, AASX schreiben nicht wenig. */
const GRENZE = { max: 120, timeWindow: "5 minutes" } as const;

/**
 * Die Wurzel fuer Download-Links, aus der Anfrage abgeleitet.
 *
 * Bewusst keine eigene Einstellung: der Server steht hinter Caddy mal unter
 * `localhost:3200`, mal unter `axon-editor.sliplane.app`, und ein fest eingetragener
 * Wert waere genau einmal richtig. `trustProxy` steht in `app.ts`, deshalb traegt
 * `req.protocol` bereits `x-forwarded-proto`.
 */
function basisUrlVon(req: FastifyRequest): string {
  const host = req.headers.host ?? "localhost";
  return `${req.protocol}://${host}`;
}

/** Ein Fehlerrumpf, den ein MCP-Klient lesen kann. JSON-RPC kennt kein 405. */
const NICHT_ERLAUBT = {
  jsonrpc: "2.0",
  error: { code: -32000, message: "Method not allowed. Der MCP-Zugang nimmt nur POST." },
  id: null,
};

export async function mcpRoutes(app: FastifyInstance, env: ServerEnv): Promise<void> {
  // Beim Start einmal durchfegen: was ein voriger Lauf abgelegt hat, ist laengst abgelaufen.
  raeumeAuf(env);

  await app.register(rateLimit, { global: false });

  app.register(async (scope) => {
    scope.post("/api/mcp", { config: { rateLimit: GRENZE } }, async (req, reply) => {
      const server = baueMcpServer({ env, basisUrl: basisUrlVon(req) });
      const transport = new StreamableHTTPServerTransport({
        // Zustandslos. Ohne diese Zeile vergibt der Transport Sitzungskennungen und
        // weist jede Folgeanfrage ohne passende Kennung mit 400 ab.
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      // Fastify hat den Rumpf bereits gelesen; ab hier bedient der Transport den Sockel.
      reply.hijack();
      reply.raw.on("close", () => {
        void transport.close();
        void server.close();
      });

      await server.connect(transport);
      await transport.handleRequest(req.raw, reply.raw, req.body);
    });

    for (const methode of ["GET", "DELETE"] as const) {
      scope.route({
        method: methode,
        url: "/api/mcp",
        handler: (_req, reply) => reply.code(405).send(NICHT_ERLAUBT),
      });
    }

    /*
     * Der Download. Der Token ist die einzige Adresse und wird in `services/ausgabe.ts`
     * gegen sein Muster geprueft, bevor er an einen Pfad geraet: sonst waere
     * "../../aas-editor.db" ein gueltiger Token.
     */
    scope.get(
      "/api/mcp/dateien/:token",
      { config: { rateLimit: GRENZE } },
      (req, reply) => {
        const { token } = req.params as { token: string };
        const datei = abrufen(env, token);
        // Abgelaufen und erfunden geben dieselbe Antwort. Ein eigener Code fuer
        // "gab es mal" verriete, dass der Token echt war.
        if (datei === null) {
          return reply.code(404).send({ code: "datei-abgelaufen", message: "File not found." });
        }
        return reply
          .header("content-type", datei.info.contentType)
          .header("content-length", String(datei.info.groesse))
          .header("content-disposition", `attachment; filename="${datei.info.dateiname}"`)
          .send(datei.bytes);
      },
    );
  });
}
