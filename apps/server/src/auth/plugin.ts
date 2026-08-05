import cookie from "@fastify/cookie";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ServerEnv } from "../env.js";
import { unauthorized } from "../errors.js";
import { EnvAuthProvider, type AuthProvider, type AuthUser } from "./provider.js";

declare module "fastify" {
  interface FastifyInstance {
    auth: AuthProvider;
    requireAuth: (req: FastifyRequest) => Promise<void>;
  }
  interface FastifyRequest {
    benutzer: AuthUser | null;
  }
}

/**
 * Haengt den AuthProvider und den requireAuth-Hook an die Instanz.
 *
 * Bewusst kein eigenes Plugin mit Kapselung: die Dekoration soll auf der Wurzelinstanz
 * liegen, damit jede Route sie sieht.
 */
export async function installAuth(app: FastifyInstance, env: ServerEnv): Promise<void> {
  await app.register(cookie, { secret: env.sessionSecret });

  app.decorate("auth", new EnvAuthProvider(env));
  app.decorateRequest("benutzer", null);

  app.decorate("requireAuth", async function (this: FastifyInstance, req: FastifyRequest) {
    const user = await app.auth.getUserFromRequest(req);
    if (user === null) throw unauthorized();
    req.benutzer = user;
  });
}
