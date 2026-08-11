import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ServerEnv } from "../env.js";
import { pruefeSignatur, sha256Von } from "../mcp/bytes.js";
import { baueMcpServer } from "../mcp/server.js";
import { ERLAUBTE_TYPEN, MAX_ANHANG_BYTES } from "../mcp/werkzeuge.js";
import { anhaenge, ausgabe, entwuerfe } from "../services/ablage.js";
import { badRequest } from "../errors.js";

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
 * **Ohne Absicherung.** Wer die Adresse kennt, kann pruefen, umwandeln, Dateien erzeugen
 * und Anhaenge hochladen. Projekte, Anhaenge der Projekte und Einstellungen sind nicht
 * erreichbar: die Werkzeuge bekommen `db` gar nicht erst zu sehen. Gegen den
 * verbleibenden Missbrauch stehen die Ratenbegrenzung hier, die Groessengrenzen und die
 * Positivliste in `mcp/werkzeuge.ts` sowie der Zaun gegen das interne Netz in
 * `mcp/netz.ts`.
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
function basisUrlVon(req: FastifyRequest, env: ServerEnv): string {
  // PUBLIC_BASE_URL schlaegt den Host-Kopf: der ist Nutzerdaten, und ein untergeschobener
  // Aufruf bekaeme sonst Download-Links auf eine fremde Domain (Sicherheitsaudit
  // 11.08.2026). Ohne die Einstellung bleibt es beim Host, wie bisher.
  if (env.publicBaseUrl !== null) return env.publicBaseUrl;
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
  // Beim Start einmal durchfegen. Anders als frueher ist hier nicht alles abgelaufen: die
  // Fristen liegen bei 24 Stunden, ein Neustart mitten in einer Sitzung soll den Entwurf
  // nicht mitnehmen. Weggeraeumt wird nur, was wirklich alt ist.
  ausgabe(env).raeumeAuf();
  anhaenge(env).raeumeAuf();
  entwuerfe(env).raeumeAuf();

  // Die Ratenbegrenzung selbst steht in `app.ts`: sie ist ein fp-Plugin und vertraegt genau
  // eine Anmeldung. Hier wird sie nur noch je Route in Anspruch genommen.
  app.register(async (scope) => {
    scope.post("/api/mcp", { config: { rateLimit: GRENZE } }, async (req, reply) => {
      const server = baueMcpServer({ env, basisUrl: basisUrlVon(req, env) });
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
     * Anhaenge hochladen. Der Weg fuer alles, was zu gross fuer base64 ist, also fuer
     * jedes echte Datenblatt.
     *
     * Gedacht fuer eine Umgebung mit Shell (Claude Code, curl). Der Browser-Chat kann
     * eine hochgeladene Datei nicht hierher weiterreichen; das ist eine Grenze des
     * Klienten und keine des Servers.
     */
    scope.post(
      "/api/mcp/anhaenge",
      { config: { rateLimit: GRENZE } },
      async (req, reply) => {
        const teil = await req.file({ limits: { fileSize: MAX_ANHANG_BYTES } });
        if (teil === undefined) throw badRequest("datei-fehlt", "A file is required.");

        const bytes = await teil.toBuffer();
        if (teil.file.truncated) {
          throw badRequest(
            "datei-zu-gross",
            `The file exceeds ${MAX_ANHANG_BYTES / 1024 / 1024} MB.`,
          );
        }

        // Der Typ kommt aus dem Umschlag, wird aber wie jeder andere gegen die
        // Positivliste gehalten: der Upload ist derselbe Weg in denselben Container.
        const typ = (teil.mimetype ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
        if (!ERLAUBTE_TYPEN.includes(typ)) {
          throw badRequest(
            "typ-nicht-zugelassen",
            `The content type "${typ}" is not allowed. Allowed: ${ERLAUBTE_TYPEN.join(", ")}.`,
          );
        }

        const dateiname = teil.filename === "" ? "anhang" : teil.filename;

        // Derselbe Zaun wie am Werkzeug: passen Kopf und Fuss nicht zum Typ, ist die
        // Datei abgeschnitten oder falsch benannt, und beides gehoert nicht in einen
        // Container. Der Weg ist ein anderer, das Ergebnis dasselbe.
        const signatur = pruefeSignatur(new Uint8Array(bytes), typ, dateiname);
        if (signatur !== null) {
          throw badRequest(
            "datei-unstimmig",
            `${signatur.grund} ${signatur.hinweis ?? ""}`.trim(),
          );
        }

        const ablage = anhaenge(env);
        const info = ablage.ablegen({ bytes, dateiname, contentType: typ });

        void reply.code(201);
        return {
          token: info.token,
          dateiname: info.dateiname,
          contentType: info.contentType,
          groesse: info.groesse,
          sha256: sha256Von(new Uint8Array(bytes)),
          gueltigBis: new Date(info.erstellt + ablage.lebensdauerMs).toISOString(),
          hinweis: "Den Token als anhaenge[].token an aas_datei_erzeugen geben.",
        };
      },
    );

    /*
     * Der Download. Der Token ist die einzige Adresse und wird in `services/ablage.ts`
     * gegen sein Muster geprueft, bevor er an einen Pfad geraet: sonst waere
     * "../../aas-editor.db" ein gueltiger Token.
     */
    scope.get("/api/mcp/dateien/:token", { config: { rateLimit: GRENZE } }, (req, reply) => {
      const { token } = req.params as { token: string };
      const datei = ausgabe(env).abrufen(token);
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
    });
  });
}
