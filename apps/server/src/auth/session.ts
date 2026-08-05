import type { FastifyReply, FastifyRequest } from "fastify";
import type { ServerEnv } from "../env.js";

/**
 * Sitzung als signiertes httpOnly-Cookie. Kein Sitzungsspeicher, kein Zustand auf dem
 * Server: der Inhalt ist die Kennung plus Ablaufzeitpunkt, die Signatur kommt von
 * @fastify/cookie mit SESSION_SECRET.
 */

export const SESSION_COOKIE = "aas_sitzung";

export interface SessionPayload {
  readonly sub: string;
  /** Ablauf in Millisekunden seit 1970 */
  readonly exp: number;
}

export function issueSession(reply: FastifyReply, payload: SessionPayload, env: ServerEnv): void {
  const value = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  void reply.setCookie(SESSION_COOKIE, value, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    // Caddy terminiert TLS. Ohne secure in Produktion liefe das Cookie im Klartext,
    // mit secure im Entwicklungsbetrieb wuerde der Browser es ueber http verwerfen.
    secure: env.production,
    signed: true,
    maxAge: Math.floor(env.sessionTtlMs / 1000),
  });
}

export function clearSession(reply: FastifyReply, env: ServerEnv): void {
  void reply.clearCookie(SESSION_COOKIE, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env.production,
  });
}

export function readSession(req: FastifyRequest): SessionPayload | null {
  const raw = req.cookies[SESSION_COOKIE];
  if (raw === undefined) return null;

  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || unsigned.value === null) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(unsigned.value, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp <= Date.now()) return null;
    return { sub: payload.sub, exp: payload.exp };
  } catch {
    return null;
  }
}
