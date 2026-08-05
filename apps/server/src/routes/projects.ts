import type { FastifyInstance } from "fastify";
import type { Db } from "../db/client.js";
import { badRequest } from "../errors.js";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  readEnvironment,
  saveProject,
  type SaveInput,
} from "../services/projects.js";
import { parsePageQuery } from "../services/pagination.js";

interface SaveBody extends SaveInput {
  revision?: unknown;
}

export function projectRoutes(app: FastifyInstance, db: Db): void {
  // Alle Projektrouten haengen am requireAuth-Hook. Kein Handler prueft selbst.
  app.register((scope, _opts, done) => {
    scope.addHook("preHandler", app.requireAuth);

    scope.get("/api/projects", (req) => {
      const page = parsePageQuery(req.query as { limit?: unknown; cursor?: unknown });
      return listProjects(db, page);
    });

    scope.post("/api/projects", (req, reply) => {
      const body = (req.body ?? {}) as SaveBody & { name?: unknown };
      if (typeof body.name !== "string" || body.name.trim() === "") {
        throw badRequest("ungueltige-anfrage", "Ein Projektname wird erwartet.");
      }
      const created = createProject(db, { ...body, name: body.name.trim() });
      void reply.code(201);
      return created;
    });

    scope.get("/api/projects/:id", (req) => {
      const { id } = req.params as { id: string };
      const project = getProject(db, id);
      return {
        projekt: {
          id: project.id,
          name: project.name,
          metamodelVersion: project.metamodelVersion,
          sourceFormat: project.sourceFormat,
          revision: project.revision,
          nodeCount: project.nodeCount,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        },
        revision: project.revision,
        environment: readEnvironment(db, id),
      };
    });

    scope.put("/api/projects/:id", (req) => {
      const { id } = req.params as { id: string };
      const body = (req.body ?? {}) as SaveBody;
      if (typeof body.revision !== "number" || !Number.isInteger(body.revision)) {
        throw badRequest("ungueltige-anfrage", "Die erwartete Revision wird mitgeschickt.");
      }
      if (body.environment === undefined) {
        throw badRequest("ungueltige-anfrage", "Das Environment fehlt.");
      }
      return { projekt: saveProject(db, id, body.revision, body) };
    });

    scope.delete("/api/projects/:id", (req, reply) => {
      const { id } = req.params as { id: string };
      deleteProject(db, id);
      void reply.code(204);
      return null;
    });

    done();
  });
}
