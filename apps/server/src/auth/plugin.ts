import cookie from "@fastify/cookie";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ServerEnv } from "../env.js";
import { unauthorized } from "../errors.js";
import {
  EnvAuthProvider,
  OidcAuthProvider,
  type AuthProvider,
  type AuthUser,
} from "./provider.js";

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

  /*
   * Die Wahl faellt genau hier, einmal beim Start. Keine Route und kein Bauteil der
   * Oberflaeche entscheidet spaeter noch einmal, woher die Identitaet kommt.
   */
  /*
   * Die Anmerkung ist noetig, nicht Zierde: ohne sie leitet TypeScript den Typ aus dem
   * gewaehlten Zweig ab (`EnvAuthProvider`) statt aus der Vereinbarung im Modul, und die
   * zweite Spielart passt dann nicht mehr hinein.
   */
  const anmeldung: AuthProvider =
    env.authModus === "oidc" && env.oidc
      ? new OidcAuthProvider(env.oidc)
      : new EnvAuthProvider(env);
  app.decorate<AuthProvider>("auth", anmeldung);
  app.decorateRequest("benutzer", null);

  app.decorate("requireAuth", async function (this: FastifyInstance, req: FastifyRequest) {
    const user = await app.auth.getUserFromRequest(req);
    if (user === null) throw unauthorized();
    req.benutzer = user;
  });
}
