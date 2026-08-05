import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import type { ServerEnv } from "../env.js";
import { badRequest, unauthorized } from "../errors.js";
import { clearSession, issueSession } from "../auth/session.js";

interface LoginBody {
  benutzer?: unknown;
  passwort?: unknown;
}

export async function authRoutes(app: FastifyInstance, env: ServerEnv): Promise<void> {
  // Nur an dieser Route, nicht global: die Ratenbegrenzung soll Anmeldeversuche bremsen,
  // nicht das Blaettern in der Projektliste.
  await app.register(rateLimit, { global: false });

  app.post(
    "/api/auth/login",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "15 minutes" },
      },
    },
    async (req, reply) => {
      const body = (req.body ?? {}) as LoginBody;
      if (typeof body.benutzer !== "string" || typeof body.passwort !== "string") {
        throw badRequest("ungueltige-anfrage", "Benutzername und Passwort werden erwartet.");
      }

      const user = await app.auth.verifyCredentials(body.benutzer, body.passwort);
      if (user === null) {
        req.log.info({ benutzer: body.benutzer }, "Anmeldung fehlgeschlagen");
        throw unauthorized("Benutzername oder Passwort stimmt nicht.");
      }

      issueSession(reply, { sub: user.id, exp: Date.now() + env.sessionTtlMs }, env);
      return { benutzer: user };
    },
  );

  app.post("/api/auth/logout", (_req, reply) => {
    clearSession(reply, env);
    return { abgemeldet: true };
  });

  app.get("/api/auth/me", async (req) => {
    const user = await app.auth.getUserFromRequest(req);
    if (user === null) throw unauthorized();
    return { benutzer: user };
  });
}
