import type { FastifyError, FastifyInstance } from "fastify";

/**
 * Fehler mit Statuscode, maschinenlesbarer Kennung und deutscher Meldung.
 *
 * Die Kennung ist das, worauf das Frontend schaltet (etwa "revision-konflikt"),
 * die Meldung das, was der Nutzer liest. Beides gehoert zusammen an eine Stelle,
 * sonst erfindet jeder Handler seine eigene Fehlerform.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(400, code, message, details);
export const unauthorized = (message = "Nicht angemeldet.") =>
  new AppError(401, "nicht-angemeldet", message);
export const notFound = (message: string) => new AppError(404, "nicht-gefunden", message);
export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(409, code, message, details);

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      request.log.info({ code: error.code, statusCode: error.statusCode }, error.message);
      void reply
        .code(error.statusCode)
        .send({ code: error.code, message: error.message, ...(error.details ?? {}) });
      return;
    }

    // Fastify meldet zu grosse Uploads und kaputtes JSON selbst, das bleibt so.
    const statusCode = error.statusCode ?? 500;
    if (statusCode < 500) {
      void reply
        .code(statusCode)
        .send({ code: error.code ?? "ungueltige-anfrage", message: error.message });
      return;
    }

    request.log.error(error);
    void reply.code(500).send({ code: "serverfehler", message: "Unerwarteter Serverfehler." });
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({ code: "nicht-gefunden", message: "Route unbekannt." });
  });
}
