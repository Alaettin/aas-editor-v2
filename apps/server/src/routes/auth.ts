import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ServerEnv } from "../env.js";
import { anmeldungFalsch, badRequest, unauthorized } from "../errors.js";
import { clearSession, issueSession } from "../auth/session.js";
import { gleich, OidcFehler } from "../auth/oidc.js";

interface LoginBody {
  benutzer?: unknown;
  passwort?: unknown;
}

/**
 * Der Anlauf einer OIDC-Anmeldung, fuer die Dauer der Umleitung.
 *
 * Er liegt in einem eigenen, **signierten** httpOnly-Cookie und nicht in einem Speicher
 * auf dem Server: der Editor haelt sonst keinen Zustand, und einen nur fuer die Anmeldung
 * einzufuehren waere ein Serverzustand, der beim naechsten Neustart Anmeldungen mitten im
 * Weg abbrechen liesse.
 */
const ANLAUF_COOKIE = "aas_anlauf";
/** Kurz. Wer laenger als zehn Minuten fuer eine Anmeldung braucht, faengt neu an. */
const ANLAUF_TTL_MS = 10 * 60 * 1000;

interface Anlauf {
  readonly state: string;
  readonly verifizierer: string;
  readonly nonce: string;
}

function setzeAnlauf(reply: FastifyReply, anlauf: Anlauf, env: ServerEnv): void {
  void reply.setCookie(
    ANLAUF_COOKIE,
    Buffer.from(JSON.stringify(anlauf), "utf8").toString("base64url"),
    {
      path: "/api/auth",
      httpOnly: true,
      // `lax` reicht und ist noetig: der Rueckweg kommt als Navigation vom Hub, also von
      // einer fremden Herkunft. Mit `strict` schickte der Browser das Cookie dabei nicht
      // mit, und jede Anmeldung scheiterte am fehlenden `state`.
      sameSite: "lax",
      secure: env.production,
      signed: true,
      maxAge: Math.floor(ANLAUF_TTL_MS / 1000),
    },
  );
}

export async function authRoutes(app: FastifyInstance, env: ServerEnv): Promise<void> {
  // Nur an diesen Routen, nicht global: die Ratenbegrenzung soll Anmeldeversuche bremsen,
  // nicht das Blaettern in der Projektliste.
  await app.register(rateLimit, { global: false });

  /**
   * Womit sich dieser Editor anmeldet. Ohne Anmeldung abrufbar, denn die Anmeldemaske
   * muss es wissen, bevor sie etwas anzeigen kann. Preisgegeben wird nichts, was nicht
   * ohnehin am ersten Klick sichtbar waere.
   */
  app.get("/api/auth/modus", () => ({ modus: app.auth.art }));

  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      if (app.auth.art !== "passwort") {
        throw badRequest(
          "anmeldung-ueber-hub",
          "This editor signs in through AXON Studio. Use /api/auth/anmelden.",
        );
      }

      const body = (req.body ?? {}) as LoginBody;
      if (typeof body.benutzer !== "string" || typeof body.passwort !== "string") {
        throw badRequest("benutzerdaten-fehlen", "Username and password are required.");
      }

      const user = await app.auth.verifyCredentials(body.benutzer, body.passwort);
      if (user === null) {
        req.log.info({ benutzer: body.benutzer }, "Anmeldung fehlgeschlagen");
        throw anmeldungFalsch();
      }

      issueSession(reply, { sub: user.id, name: user.name, exp: Date.now() + env.sessionTtlMs }, env);
      return { benutzer: user };
    },
  );

  /**
   * Der Weg zum Hub. Eine Umleitung, kein Formular, deshalb GET: der Browser folgt ihr
   * unmittelbar, und die Anmeldemaske muss nichts weiter tun als hierher zu zeigen.
   */
  app.get(
    "/api/auth/anmelden",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (_req, reply) => {
      if (app.auth.art !== "oidc") {
        throw badRequest("kein-hub", "This editor signs in with a password.");
      }
      const anlauf = await app.auth.beginneAnmeldung();
      setzeAnlauf(reply, anlauf, env);
      return await reply.redirect(anlauf.adresse, 302);
    },
  );

  /**
   * Der Rueckweg vom Hub.
   *
   * Alles, was hier schiefgehen kann, endet auf der Anmeldemaske mit einem Grund in der
   * Adresse, nicht in einer JSON-Fehlerseite: hierher kommt ein **Browser** nach einer
   * Navigation, kein Programm nach einem fetch.
   */
  app.get(
    "/api/auth/callback",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const zurueck = (grund: string) => reply.redirect(`/login?fehler=${grund}`, 302);

      if (app.auth.art !== "oidc") return await zurueck("kein-hub");

      const abfrage = req.query as { code?: string; state?: string; error?: string };
      // Der Nutzer hat abgelehnt, oder der Hub hat abgebrochen. Kein Fehler unsererseits.
      if (abfrage.error) return await zurueck(abfrage.error === "access_denied" ? "abgelehnt" : "hub");
      if (!abfrage.code || !abfrage.state) return await zurueck("unvollstaendig");

      const roh = req.cookies[ANLAUF_COOKIE];
      void reply.clearCookie(ANLAUF_COOKIE, { path: "/api/auth" });
      if (roh === undefined) return await zurueck("abgelaufen");

      const entsiegelt = req.unsignCookie(roh);
      if (!entsiegelt.valid || entsiegelt.value === null) return await zurueck("abgelaufen");

      let anlauf: Anlauf;
      try {
        anlauf = JSON.parse(
          Buffer.from(entsiegelt.value, "base64url").toString("utf8"),
        ) as Anlauf;
      } catch {
        return await zurueck("abgelaufen");
      }

      // `state` bindet den Rueckweg an genau den Anlauf, der ihn ausgeloest hat. Ohne
      // diese Pruefung koennte ein Fremder eine Anmeldung unterschieben.
      if (!gleich(anlauf.state, abfrage.state)) return await zurueck("state");

      try {
        const benutzer = await app.auth.schliesseAnmeldung(
          abfrage.code,
          anlauf.verifizierer,
          anlauf.nonce,
        );
        issueSession(
          reply,
          { sub: benutzer.id, name: benutzer.name, exp: Date.now() + env.sessionTtlMs },
          env,
        );
        return await reply.redirect("/projekte", 302);
      } catch (ursache) {
        // Der Grund gehoert ins Protokoll, nicht in die Adresszeile: er nennt mitunter
        // Einzelheiten des Ausstellers, die niemanden etwas angehen.
        req.log.warn(
          { fehler: ursache instanceof Error ? ursache.message : String(ursache) },
          "Anmeldung ueber den Hub gescheitert",
        );
        return await zurueck(ursache instanceof OidcFehler ? "token" : "unbekannt");
      }
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
