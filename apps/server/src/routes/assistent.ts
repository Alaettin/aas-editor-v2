import type { FastifyInstance, FastifyReply } from "fastify";
import type { Db } from "../db/client.js";
import type { ServerEnv } from "../env.js";
import { AppError } from "../errors.js";
import { pruefeEingabe, starteStrom } from "../services/assistent.js";
import { besitzer } from "../services/projects.js";

/**
 * Eine Runde des Assistenten: Eingabeliste hinein, Ereignisstrom hinaus.
 *
 * Der Strom ist bewusst schmal. Vier Arten reichen, weil der Browser die
 * Werkzeuge selbst ausfuehrt und dafuer nur die fertige Ausgabeliste braucht:
 *
 * - `text`     laufender Text, Stueck fuer Stueck, nur zum Anzeigen
 * - `werkzeug` ein Werkzeugaufruf steht fest, ebenfalls nur zum Anzeigen
 * - `fertig`   die vollstaendige Ausgabeliste und der Verbrauch. **Das ist das
 *              Massgebliche**: der Browser haengt genau diese Liste an seinen Verlauf.
 * - `fehler`   uebersetzbarer Code plus englischer Text
 *
 * Die Textstuecke sammelt der Browser nicht auf, um daraus den Verlauf zu bauen; sonst
 * haetten ein abgerissener Strom und ein vollstaendiger Verlauf dieselbe Wirkung.
 */

interface Ereignis {
  readonly art: "text" | "werkzeug" | "fertig" | "fehler";
  readonly [feld: string]: unknown;
}

function sende(reply: FastifyReply, ereignis: Ereignis): void {
  reply.raw.write(`data: ${JSON.stringify(ereignis)}\n\n`);
}

/**
 * Wie lange der Strom hoechstens schweigen darf.
 *
 * Ein Modell, das ein ganzes Teilmodell entwirft, denkt eine Weile, bevor das erste
 * Textstueck kommt. In dieser Stille fliesst kein Byte, und ein Zwischenstueck (der
 * Vite-Proxy in der Entwicklung, Caddy im Betrieb) haelt die Verbindung fuer tot und
 * schliesst sie: im Browser erscheint dann ein Netzwerkfehler, obwohl beide Enden
 * arbeiten. Die Kommentarzeile von SSE haelt sie wach, der Leser im Browser uebergeht
 * sie, weil er in jedem Block nur die Zeile mit `data: ` liest.
 */
const PULS_MS = 15_000;

export function assistentRoutes(app: FastifyInstance, db: Db, env: ServerEnv): void {
  // Die Ratenbegrenzung ist in `app.ts` angemeldet; hier wird sie nur je Route genutzt.
  app.register((scope, _opts, fertig) => {
    scope.addHook("preHandler", app.requireAuth);

    scope.post(
      "/api/assistent/nachricht",
      {
        // Jede Runde kostet Geld, und zwar den, dessen Schluessel liegt. Der Zaun bremst
        // eine durchgedrehte Schleife im Browser, bevor sie die Rechnung schreibt, und
        // zaehlt **je Nutzer** statt je IP: sonst teilten sich hinter einem gemeinsamen
        // Ausgang mehrere Nutzer einen Eimer (Sicherheitsaudit 11.08.2026).
        config: {
          rateLimit: {
            max: 60,
            timeWindow: "5 minutes",
            keyGenerator: (req) => req.benutzer?.id ?? req.ip,
          },
        },
      },
      async (req, reply) => {
        const eingabe = pruefeEingabe(req.body);
        const wer = besitzer(req);

        /*
         * Bricht der Nutzer ab oder schliesst den Reiter, soll auch der Anbieter
         * aufhoeren. Das Signal haengt am **Antwort**-Strom: `req.raw` schliesst schon,
         * sobald der Rumpf gelesen ist, und haette den Anbieter mitten im Satz
         * abgeschnitten.
         */
        const abbruch = new AbortController();
        reply.raw.on("close", () => {
          if (!reply.raw.writableEnded) abbruch.abort();
        });

        /*
         * Der Strom startet **vor** den SSE-Kopfzeilen. Fehlt der Schluessel, ist das ein
         * gewoehnlicher 412 mit Code, den der Fehlerbehandler uebersetzbar ausliefert;
         * innerhalb eines laufenden Stroms waere daraus ein 200 mit Fehlertext geworden.
         */
        const strom = await starteStrom(db, env, wer, { eingabe, signal: abbruch.signal });

        // Ab hier bedient die Route den Sockel selbst; Fastify soll nicht auch noch
        // eine Antwort senden wollen, die es laengst nicht mehr gibt.
        reply.hijack();
        reply.raw.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
          // Ohne das puffert ein Proxy den Strom und der Nutzer sieht minutenlang nichts.
          "x-accel-buffering": "no",
        });
        // Erstes Byte sofort, damit die Kopfzeilen wirklich hinausgehen und nicht im
        // Puffer eines Zwischenstuecks auf Gesellschaft warten.
        reply.raw.write(": start\n\n");

        const puls = setInterval(() => {
          if (!reply.raw.writableEnded) reply.raw.write(": puls\n\n");
        }, PULS_MS);

        try {
          for await (const ereignis of strom) {
            switch (ereignis["type"]) {
              case "response.output_text.delta":
                sende(reply, { art: "text", text: ereignis["delta"] });
                break;

              case "response.output_item.done": {
                const teil = ereignis["item"] as { type?: string; name?: string } | undefined;
                if (teil?.type === "function_call") {
                  sende(reply, { art: "werkzeug", name: teil.name });
                }
                break;
              }

              case "response.completed": {
                const antwort = ereignis["response"] as {
                  output?: unknown;
                  usage?: unknown;
                };
                sende(reply, {
                  art: "fertig",
                  ausgabe: antwort?.output ?? [],
                  verbrauch: antwort?.usage ?? null,
                });
                break;
              }

              case "error":
                sende(reply, {
                  art: "fehler",
                  code: "assistent-anbieter",
                  meldung: String(ereignis["message"] ?? "Provider error."),
                });
                break;

              default:
                break;
            }
          }
        } catch (fehler) {
          // Der Abbruch durch den Nutzer ist kein Fehler, da hoert nur niemand mehr zu.
          if (!abbruch.signal.aborted) {
            req.log.error(fehler);
            const code = fehler instanceof AppError ? fehler.code : "assistent-anbieter";
            sende(reply, { art: "fehler", code, meldung: (fehler as Error).message });
          }
        } finally {
          clearInterval(puls);
          reply.raw.end();
        }

        return reply;
      },
    );

    fertig();
  });
}
