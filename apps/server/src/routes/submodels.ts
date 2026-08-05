import { decodeIdentifier } from "@aas-editor/core";
import { and, asc, eq, gt, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Db } from "../db/client.js";
import { projects as projectsTable, submodels } from "../db/schema.js";
import { badRequest, notFound } from "../errors.js";
import { parsePageQuery, toPage, type Cursor } from "../services/pagination.js";
import { getProject } from "../services/projects.js";

/**
 * Einzelne Submodels unter ihrer base64url-kodierten `id`, in der Form von IDTA-01002.
 *
 * Das ist noch nicht das Submodel Repository, aber der Beweis, dass die Ablage dafuer
 * richtig geschnitten ist: hier wird eine Zeile gelesen und geschrieben, nicht das
 * Environment als Ganzes.
 */

function decode(encoded: string): string {
  try {
    const id = decodeIdentifier(encoded);
    if (id === "") throw new Error("leer");
    return id;
  } catch {
    throw badRequest("ungueltige-kennung", "The identifier is not base64url encoded.");
  }
}

export function submodelRoutes(app: FastifyInstance, db: Db): void {
  app.register((scope, _opts, done) => {
    scope.addHook("preHandler", app.requireAuth);

    scope.get("/api/projects/:id/submodels", (req) => {
      const { id } = req.params as { id: string };
      getProject(db, id);
      const page = parsePageQuery(req.query as { limit?: unknown; cursor?: unknown });

      // Sortiert nach der fachlichen id, so wie das spaetere Repository blaettert.
      const cursorWhere =
        page.cursor === null
          ? undefined
          : or(
              gt(submodels.id, String(page.cursor.k)),
              and(eq(submodels.id, String(page.cursor.k)), gt(submodels.rowId, page.cursor.i)),
            );

      const rows = db
        .select({ rowId: submodels.rowId, id: submodels.id, json: submodels.json })
        .from(submodels)
        .where(and(eq(submodels.projectId, id), cursorWhere))
        .orderBy(asc(submodels.id), asc(submodels.rowId))
        .limit(page.limit + 1)
        .all();

      const pageResult = toPage(rows, page.limit, (row): Cursor => ({ k: row.id, i: row.rowId }));
      return {
        items: pageResult.items.map((row) => JSON.parse(row.json) as unknown),
        nextCursor: pageResult.nextCursor,
      };
    });

    scope.get("/api/projects/:id/submodels/:encodedId", (req) => {
      const { id, encodedId } = req.params as { id: string; encodedId: string };
      getProject(db, id);
      const row = db
        .select({ json: submodels.json })
        .from(submodels)
        .where(and(eq(submodels.projectId, id), eq(submodels.id, decode(encodedId))))
        .get();
      if (row === undefined) throw notFound("submodel-nicht-gefunden", "Submodel not found.");
      return JSON.parse(row.json) as unknown;
    });

    scope.put("/api/projects/:id/submodels/:encodedId", (req) => {
      const { id, encodedId } = req.params as { id: string; encodedId: string };
      const project = getProject(db, id);
      const submodelId = decode(encodedId);

      const body = req.body as Record<string, unknown> | undefined;
      if (body === undefined || typeof body !== "object" || Array.isArray(body)) {
        throw badRequest("submodel-fehlt", "A submodel is required.");
      }
      if (body["id"] !== submodelId) {
        throw badRequest(
          "kennung-widerspricht",
          "The id in the body does not match the identifier in the path.",
        );
      }

      const now = Date.now();
      const result = db
        .update(submodels)
        .set({
          json: JSON.stringify(body),
          idShort: typeof body["idShort"] === "string" ? body["idShort"] : null,
          updatedAt: now,
        })
        .where(and(eq(submodels.projectId, id), eq(submodels.id, submodelId)))
        .run();
      if (result.changes === 0) throw notFound("submodel-nicht-gefunden", "Submodel not found.");

      // Der Schreibzugriff geht am Editor vorbei, also muss die Revision steigen. Sonst
      // ueberschreibt ein offener Tab die Aenderung, ohne einen Konflikt zu sehen.
      db.update(projectsTable)
        .set({ revision: project.revision + 1, updatedAt: now })
        .where(eq(projectsTable.id, id))
        .run();

      return { revision: project.revision + 1 };
    });

    done();
  });
}
