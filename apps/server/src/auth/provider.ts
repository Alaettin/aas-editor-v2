import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { ServerEnv } from "../env.js";
import { readSession } from "./session.js";

/**
 * Die gesamte Anmeldelogik liegt hinter diesem Interface, in genau dieser Datei.
 *
 * Ein Wechsel auf better-auth, OIDC oder Keycloak tauscht die Implementierung aus, ohne
 * dass eine Route davon erfaehrt (Plan Abschnitt 9). Deshalb darf keine Auth-Logik in die
 * Handler wandern.
 */

export interface AuthUser {
  readonly id: string;
  readonly name: string;
}

export interface AuthProvider {
  verifyCredentials(user: string, password: string): Promise<AuthUser | null>;
  getUserFromRequest(req: FastifyRequest): Promise<AuthUser | null>;
}

/**
 * timingSafeEqual verlangt gleich lange Puffer und wirft sonst. Ein zu kurzes Passwort
 * gaebe damit einen 500er statt eines 401. Beide Seiten laufen deshalb vorher durch
 * sha256, das ergibt immer 32 Bytes.
 */
function equalsConstantTime(a: string, b: string): boolean {
  const left = createHash("sha256").update(a, "utf8").digest();
  const right = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(left, right);
}

/** Ein Benutzer, Zugangsdaten aus der .env, keine Benutzertabelle. */
export class EnvAuthProvider implements AuthProvider {
  constructor(private readonly env: ServerEnv) {}

  private get user(): AuthUser {
    return { id: "einzelbenutzer", name: this.env.authUsername };
  }

  verifyCredentials(user: string, password: string): Promise<AuthUser | null> {
    // Beide Vergleiche immer ausfuehren, nicht kurzschliessen: sonst verraet die Laufzeit,
    // ob der Benutzername stimmte.
    const userOk = equalsConstantTime(user, this.env.authUsername);
    const passwordOk = equalsConstantTime(password, this.env.authPassword);
    return Promise.resolve(userOk && passwordOk ? this.user : null);
  }

  getUserFromRequest(req: FastifyRequest): Promise<AuthUser | null> {
    const session = readSession(req);
    if (session === null) return Promise.resolve(null);
    return Promise.resolve(session.sub === this.user.id ? this.user : null);
  }
}
