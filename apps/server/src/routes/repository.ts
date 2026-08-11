import { decodeIdentifier } from "@aas-editor/core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { wurzelVon } from "../basisUrl.js";
import type { Db } from "../db/client.js";
import type { ServerEnv } from "../env.js";
import { AppError, badRequest } from "../errors.js";
import { parsePageQuery } from "../services/pagination.js";
import { besitzer } from "../services/projects.js";
import {
  entferne,
  findeRepository,
  holeRepository,
  listeEintraege,
  oeffentlicheListe,
  oeffentlichesSubmodel,
  repositoryExistiert,
  starteRepository,
  uebernehme,
} from "../services/repository.js";

/**
 * Das Submodel Repository, in zwei Bloecken.
 *
 * **Oeffentlich** unter `/api/repo/:repoId/...`: die beiden Lesezugriffe aus IDTA-01002,
 * ohne Anmeldung. Geschuetzt allein durch die UUID in der Adresse, und das ist eine
 * Entscheidung, keine Luecke: die gaengigen AAS-Klienten (Package Explorer, BaSyx) nehmen
 * eine Basis-Adresse entgegen und sonst nichts. Wer die Adresse hat, liest die Teilmodelle.
 * Deshalb steht in der Adresse auch **nicht** die Kennung des Nutzers, sondern eine eigene
 * UUID; siehe `db/schema.ts`.
 *
 * **Angemeldet** unter `/api/repository/...`: starten, uebernehmen, entfernen. Alles hinter
 * `besitzer(req)`.
 *
 * Beide unter `/api/`, damit der SPA-Rueckfall sie in Ruhe laesst (siehe `errors.ts`). Ein
 * Fassungssegment wie `/api/v3.0/` gibt es nicht: der Klient bekommt die Basis-Adresse und
 * haengt `/submodels` selbst an, ein Praefix traegt dazu nichts bei.
 */

/** Lesend und guenstig, aber oeffentlich. Grosszuegiger als der MCP-Zugang. */
const GRENZE = { max: 300, timeWindow: "1 minute" } as const;

/**
 * Ein Fehlerrumpf nach IDTA-01002 statt des hauseigenen `{code, message}`.
 *
 * Die beiden oeffentlichen Routen sind die einzige Stelle des Servers, an der ein fremdes
 * Programm mitliest, das nur die Spezifikation kennt. Es soll die Antwort lesen koennen,
 * die dort beschrieben ist. Deshalb werfen sie nicht, sondern antworten selbst: der globale
 * Fehlerbehandler kennt nur die hauseigene Form.
 */
function alsResult(reply: FastifyReply, status: number, text: string): FastifyReply {
  return reply.code(status).send({
    messages: [
      {
        code: String(status),
        messageType: "Error",
        text,
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

/** Ein `AppError` aus den geteilten Diensten in die Form der Spezifikation. */
function alsResultFehler(reply: FastifyReply, fehler: unknown): FastifyReply {
  if (fehler instanceof AppError) return alsResult(reply, fehler.statusCode, fehler.message);
  throw fehler;
}

function decode(encoded: string): string {
  try {
    const id = decodeIdentifier(encoded);
    if (id === "") throw new Error("leer");
    return id;
  } catch {
    throw badRequest("ungueltige-kennung", "The identifier is not base64url encoded.");
  }
}

/** Die Basis-Adresse dieses Repositories. Die Wurzel dahinter steht in `basisUrl.ts`. */
function basisAdresse(req: FastifyRequest, env: ServerEnv, repoId: string): string {
  return `${wurzelVon(req, env)}/api/repo/${repoId}`;
}

export function repositoryRoutes(app: FastifyInstance, db: Db, env: ServerEnv): void {
  // --- oeffentlich ---------------------------------------------------------------------
  //
  // Ohne `requireAuth`. Die Ratenbegrenzung ist in `app.ts` angemeldet und wird hier nur
  // je Route in Anspruch genommen.
  app.register((scope, _opts, fertig) => {
    scope.get(
      "/api/repo/:repoId/submodels",
      { config: { rateLimit: GRENZE } },
      (req, reply) => {
        const { repoId } = req.params as { repoId: string };
        if (!repositoryExistiert(db, repoId)) {
          return alsResult(reply, 404, "Submodel repository not found.");
        }

        const roh = req.query as { limit?: unknown; cursor?: unknown; idShort?: unknown };
        try {
          const page = parsePageQuery(roh);
          // Der Filter geht in die Abfrage; eine ueberlange Zeichenkette waere billiger Druck
          // auf die Datenbank (Sicherheitsaudit 11.08.2026, niedriger Befund). idShorts sind
          // kurz, 256 Zeichen sind grosszuegig.
          if (typeof roh.idShort === "string" && roh.idShort.length > 256) {
            return alsResult(reply, 400, "The idShort filter is too long.");
          }
          const idShort = typeof roh.idShort === "string" && roh.idShort !== "" ? roh.idShort : null;
          const ergebnis = oeffentlicheListe(db, repoId, page, idShort);
          /*
           * Die Form der Spezifikation, nicht die hauseigene `{items, nextCursor}`:
           * `paging_metadata` faellt weg, sobald es nicht weitergeht, statt einen
           * `cursor: null` zu fuehren, den ein Klient als Zeichenkette liest.
           */
          return reply.send({
            result: ergebnis.items,
            ...(ergebnis.nextCursor === null
              ? {}
              : { paging_metadata: { cursor: ergebnis.nextCursor } }),
          });
        } catch (fehler) {
          return alsResultFehler(reply, fehler);
        }
      },
    );

    scope.get(
      "/api/repo/:repoId/submodels/:submodelIdentifier",
      { config: { rateLimit: GRENZE } },
      (req, reply) => {
        const { repoId, submodelIdentifier } = req.params as {
          repoId: string;
          submodelIdentifier: string;
        };
        // Eine unbekannte Adresse gibt dieselbe Antwort wie ein unbekanntes Teilmodell.
        // Sonst verriete der Unterschied, welche UUIDs es gibt.
        if (!repositoryExistiert(db, repoId)) {
          return alsResult(reply, 404, "Submodel not found.");
        }
        try {
          const submodel = oeffentlichesSubmodel(db, repoId, decode(submodelIdentifier));
          if (submodel === null) return alsResult(reply, 404, "Submodel not found.");
          return reply.send(submodel);
        } catch (fehler) {
          return alsResultFehler(reply, fehler);
        }
      },
    );

    fertig();
  });

  // --- angemeldet ----------------------------------------------------------------------
  app.register((scope, _opts, done) => {
    scope.addHook("preHandler", app.requireAuth);

    scope.get("/api/repository", (req) => {
      const info = findeRepository(db, besitzer(req));
      return info === null
        ? null
        : { ...info, basisAdresse: basisAdresse(req, env, info.id) };
    });

    scope.post("/api/repository", (req) => {
      const info = starteRepository(db, besitzer(req));
      return { ...info, basisAdresse: basisAdresse(req, env, info.id) };
    });

    scope.get("/api/repository/submodels", (req) => {
      const repo = holeRepository(db, besitzer(req));
      return { items: listeEintraege(db, repo.id) };
    });

    scope.post("/api/repository/submodels", (req) => {
      const wer = besitzer(req);
      const repo = holeRepository(db, wer);

      const body = req.body as Record<string, unknown> | undefined;
      const projektId = body?.["projektId"];
      const submodelId = body?.["submodelId"];
      if (typeof projektId !== "string" || projektId === "") {
        throw badRequest("projekt-fehlt", "A projektId is required.");
      }
      if (typeof submodelId !== "string" || submodelId === "") {
        throw badRequest("submodel-fehlt", "A submodelId is required.");
      }

      return uebernehme(db, wer, repo.id, {
        projektId,
        submodelId,
        ueberschreiben: body?.["ueberschreiben"] === true,
      });
    });

    scope.delete("/api/repository/submodels/:encodedId", (req, reply) => {
      const repo = holeRepository(db, besitzer(req));
      const { encodedId } = req.params as { encodedId: string };
      entferne(db, repo.id, decode(encodedId));
      return reply.code(204).send();
    });

    done();
  });
}
