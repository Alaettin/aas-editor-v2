import type { FastifyInstance } from "fastify";
import type { Db } from "../db/client.js";
import { badRequest } from "../errors.js";
import {
  befundeVon,
  besitzer,
  createProject,
  deleteProject,
  listProjects,
  parseProjectQuery,
  readEnvironment,
  readUebersicht,
  saveProject,
  summaryOf,
  type SaveInput,
} from "../services/projects.js";

/**
 * Jede Route reicht den Besitzer aus der Sitzung durch. Seit dem 08.08.2026 gehoert ein
 * Projekt dem, der es angelegt hat; ein fremdes ist von einer erfundenen Kennung nicht zu
 * unterscheiden, es gibt 404.
 */
export function projectRoutes(app: FastifyInstance, db: Db): void {
  // Alle Projektrouten haengen am requireAuth-Hook. Kein Handler prueft selbst.
  app.register((scope, _opts, done) => {
    scope.addHook("preHandler", app.requireAuth);

    scope.get("/api/projects", (req) => {
      return listProjects(
        db,
        besitzer(req),
        parseProjectQuery(req.query as Record<string, unknown>),
      );
    });

    scope.post("/api/projects", (req, reply) => {
      const body = (req.body ?? {}) as SaveInput & { name?: unknown };
      if (typeof body.name !== "string" || body.name.trim() === "") {
        throw badRequest("projektname-fehlt", "A project name is required.");
      }
      const created = createProject(db, besitzer(req), { ...body, name: body.name.trim() });
      void reply.code(201);
      return created;
    });

    scope.get("/api/projects/:id", (req) => {
      const { id } = req.params as { id: string };
      const eigner = besitzer(req);
      const projekt = summaryOf(db, eigner, id);
      return {
        projekt,
        revision: projekt.revision,
        environment: readEnvironment(db, eigner, id),
      };
    });

    // Schmale Auskunft fuer das Detailpanel des Einstiegs, ohne das Environment.
    scope.get("/api/projects/:id/uebersicht", async (req) => {
      const { id } = req.params as { id: string };
      const eigner = besitzer(req);
      return {
        projekt: summaryOf(db, eigner, id),
        submodelle: readUebersicht(db, eigner, id),
        befunde: await befundeVon(db, eigner, id),
      };
    });

    scope.put("/api/projects/:id", (req) => {
      const { id } = req.params as { id: string };
      // Kein `revision` mehr im Rumpf: gespeichert wird ueberschreibend.
      const body = (req.body ?? {}) as SaveInput;
      if (body.environment === undefined) {
        throw badRequest("environment-fehlt", "The environment is required.");
      }
      return { projekt: saveProject(db, besitzer(req), id, body) };
    });

    scope.delete("/api/projects/:id", (req, reply) => {
      const { id } = req.params as { id: string };
      deleteProject(db, besitzer(req), id);
      void reply.code(204);
      return null;
    });

    done();
  });
}
