import type { FastifyInstance } from "fastify";
import type { Db } from "../db/client.js";
import { parsePageQuery } from "../services/pagination.js";
import { getProject } from "../services/projects.js";
import { createVersion, listVersions, readVersion } from "../services/versions.js";

export function versionRoutes(app: FastifyInstance, db: Db): void {
  app.register((scope, _opts, done) => {
    scope.addHook("preHandler", app.requireAuth);

    scope.post("/api/projects/:id/versions", (req, reply) => {
      const { id } = req.params as { id: string };
      const body = (req.body ?? {}) as { label?: unknown };
      getProject(db, id);
      const version = createVersion(db, id, {
        label: typeof body.label === "string" && body.label !== "" ? body.label : null,
      });
      void reply.code(201);
      return { version };
    });

    scope.get("/api/projects/:id/versions", (req) => {
      const { id } = req.params as { id: string };
      getProject(db, id);
      const page = parsePageQuery(req.query as { limit?: unknown; cursor?: unknown });
      return listVersions(db, id, page);
    });

    scope.get("/api/projects/:id/versions/:versionId", (req) => {
      const { id, versionId } = req.params as { id: string; versionId: string };
      return readVersion(db, id, versionId);
    });

    done();
  });
}
