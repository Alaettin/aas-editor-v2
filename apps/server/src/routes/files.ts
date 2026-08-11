import type { FastifyInstance } from "fastify";
import type { Db } from "../db/client.js";
import type { ServerEnv } from "../env.js";
import { badRequest } from "../errors.js";
import { deleteFile, listFiles, readFile, storeFile } from "../services/files.js";
import { besitzer, getProject } from "../services/projects.js";

export function fileRoutes(app: FastifyInstance, db: Db, env: ServerEnv): void {
  app.register((scope, _opts, done) => {
    scope.addHook("preHandler", app.requireAuth);

    scope.get("/api/projects/:id/files", (req) => {
      const { id } = req.params as { id: string };
      getProject(db, besitzer(req), id);
      return { items: listFiles(db, id) };
    });

    scope.post("/api/projects/:id/files", async (req, reply) => {
      const { id } = req.params as { id: string };
      getProject(db, besitzer(req), id);

      const part = await req.file();
      if (part === undefined) throw badRequest("datei-fehlt", "A file is required.");

      // Die Felder stehen im selben multipart-Umschlag. path ist der Paketpfad aus dem
      // File-Element, nicht der Dateiname.
      const bytes = await part.toBuffer();
      const fields = part.fields as Record<string, { value?: unknown } | undefined>;
      const path = fields["path"]?.value;
      const role = fields["role"]?.value;
      if (typeof path !== "string" || path === "") {
        throw badRequest("pfad-fehlt", "The package path is required.");
      }

      const info = storeFile(db, env, id, {
        path,
        contentType: part.mimetype === "" ? "application/octet-stream" : part.mimetype,
        bytes,
        ...(typeof role === "string" && role !== "" ? { role } : {}),
      });
      void reply.code(201);
      return { datei: info };
    });

    scope.get("/api/projects/:id/files/:fileId", (req, reply) => {
      const { id, fileId } = req.params as { id: string; fileId: string };
      // Ohne diesen Aufruf pruefte hier nur die Datei gegen ihr Projekt, nicht das Projekt
      // gegen seinen Besitzer: wer eine Anhangskennung kennt, laedt sonst fremde Bytes.
      getProject(db, besitzer(req), id);
      const { info, bytes } = readFile(db, env, id, fileId);
      void reply.header("content-type", info.contentType);
      void reply.header("content-length", String(info.size));
      /*
       * Der content-type kommt aus dem Upload und ist damit Nutzerdaten. Ohne diese beiden
       * Kopfzeilen liefe eine als text/html hochgeladene Datei auf dem eigenen Ursprung als
       * Skript (Sicherheitsaudit 11.08.2026, hoher Befund). `nosniff` haelt den Browser am
       * gemeldeten Typ fest, `attachment` laesst ihn herunterladen statt darstellen. Die
       * Vorschau im Editor bricht dadurch nicht: sie holt die Bytes ueber `apiBytes` und
       * baut selbst eine Blob-URL, sie navigiert nie auf diese Route.
       */
      void reply.header("x-content-type-options", "nosniff");
      void reply.header("content-disposition", "attachment");
      return reply.send(bytes);
    });

    scope.delete("/api/projects/:id/files/:fileId", (req, reply) => {
      const { id, fileId } = req.params as { id: string; fileId: string };
      getProject(db, besitzer(req), id);
      deleteFile(db, id, fileId);
      void reply.code(204);
      return null;
    });

    done();
  });
}
