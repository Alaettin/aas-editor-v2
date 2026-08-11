import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { wurzelVon } from "../basisUrl.js";
import type { ServerEnv } from "../env.js";
import { pruefeSignatur, sha256Von } from "../mcp/bytes.js";
import { baueMcpServer } from "../mcp/server.js";
import { ERLAUBTE_TYPEN, MAX_ANHANG_BYTES } from "../mcp/werkzeuge.js";
import { anruferVon, baueMcpWaechter } from "../mcp/zugang.js";
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
 * **Angemeldet seit dem 11.08.2026.** Vorher konnte jeder, der die Adresse kannte,
 * pruefen, umwandeln, Dateien erzeugen und Anhaenge hochladen. Wer herein darf, entscheidet
 * jetzt `mcp/zugang.ts`: ein Zugriffstoken des Hubs oder der feste Bearer-Token. Projekte,
 * Anhaenge der Projekte und Einstellungen bleiben unerreichbar, die Werkzeuge bekommen `db`
 * weiterhin gar nicht erst zu sehen. Daneben gelten unveraendert die Ratenbegrenzung hier,
 * die Groessengrenzen und die Positivliste in `mcp/werkzeuge.ts` sowie der Zaun gegen das
 * interne Netz in `mcp/netz.ts`.
 */

/** Eine Runde kostet Rechenzeit, AASX schreiben nicht wenig. */
const GRENZE = {
  max: 120,
  timeWindow: "5 minutes",
  /*
   * Auf den vorgezeigten Ausweis, nicht auf die Adresse. Der gesamte Verkehr von claude.ai
   * kommt aus einem einzigen Bereich (`160.79.104.0/21`); mit `req.ip` als Schluessel
   * teilten sich alle Nutzer **ein** Kontingent und behinderten sich gegenseitig.
   *
   * Der Token ist hier absichtlich **ungeprueft**: die Ratenbegrenzung haengt als
   * onRequest-Haken vor jedem preHandler, der gepruefte Anrufer aus `mcp/zugang.ts` steht
   * also noch nicht fest. Fuer einen Eimer genuegt das. Wer mit erfundenen Token um sich
   * wirft, bekommt zwar je Token einen eigenen Eimer, aber auch je Anfrage ein 401, und
   * ohne Kopfzeile faellt es ohnehin auf die Adresse zurueck. Gehasht, damit kein
   * Zugangsdatum als Schluessel im Speicher der Begrenzung liegt.
   */
  keyGenerator: (req: FastifyRequest) => {
    const kopf = req.headers.authorization;
    if (typeof kopf !== "string" || !/^Bearer\s/i.test(kopf)) return req.ip;
    return createHash("sha256").update(kopf).digest("base64url");
  },
} as const;

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
  const waechter = baueMcpWaechter(env);

  app.register(async (scope) => {
    /*
     * Die Pruefung gilt fuer **alle** Routen dieses Bereichs, auch fuer den Upload und den
     * Download. Ein Zugang, bei dem nur der Werkzeugaufruf angemeldet ist, waere keiner:
     * die Ablage haengt an denselben Token.
     */
    scope.addHook("preHandler", waechter);

    scope.post("/api/mcp", { config: { rateLimit: GRENZE } }, async (req, reply) => {
      const server = baueMcpServer({
        env,
        basisUrl: wurzelVon(req, env),
        benutzer: anruferVon(req).benutzer,
      });
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
        const info = ablage.ablegen({
          bytes,
          dateiname,
          contentType: typ,
          eigentuemer: anruferVon(req).benutzer,
        });

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
     * Der Download. Der Token wird in `services/ablage.ts` gegen sein Muster geprueft,
     * bevor er an einen Pfad geraet: sonst waere "../../aas-editor.db" ein gueltiger Token.
     *
     * Er ist die Adresse, aber seit dem 11.08.2026 nicht mehr die Berechtigung: die Datei
     * bekommt nur zu sehen, wer sie hat erzeugen lassen. Ein Link aus dem Gespraech laesst
     * sich damit nicht mehr weitergeben, und das ist die Absicht.
     */
    scope.get("/api/mcp/dateien/:token", { config: { rateLimit: GRENZE } }, (req, reply) => {
      const { token } = req.params as { token: string };
      const datei = ausgabe(env).abrufen(token, anruferVon(req).benutzer);
      // Abgelaufen, erfunden und fremd geben dieselbe Antwort. Ein eigener Code fuer
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
