import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import { pruefeJwt } from "../auth/oidc.js";
import { wurzelVon } from "../basisUrl.js";
import type { ServerEnv } from "../env.js";

/**
 * Wer darf den MCP-Zugang benutzen.
 *
 * Zwei Tueren, eine Pruefung dahinter, weil zwei Klienten mit sehr verschiedenen
 * Moeglichkeiten hereinwollen:
 *
 *   **OAuth ueber den Hub** fuer claude.ai. Der Editor ist dabei nur Ressourcenserver
 *   nach RFC 9728: er stellt keine Token aus, er prueft sie. Ausgestellt hat sie AXON
 *   Studio, und zwar mit demselben Schluesselpaar, mit dem auch die Web-Anmeldung
 *   arbeitet. Deshalb steht hier keine zweite Kryptographie, sondern `pruefeJwt`.
 *
 *   **Ein fester Bearer-Token** fuer Shell, Abnahme und lokale Arbeit. Kein Notnagel,
 *   sondern die einzige Moeglichkeit fuer Claude Code: der Hub bietet weder Dynamic
 *   Client Registration noch Client-ID-Metadata-Dokumente an, und portunabhaengige
 *   Rueckleitungen auf `localhost` nimmt er auch nicht. Ohne diese Tuer waere der Zugang
 *   aus der Shell nicht mehr benutzbar.
 *
 * **Warum `client_id` und nicht `aud`.** Die MCP-Spezifikation verlangt, dass ein
 * Ressourcenserver prueft, ob ein Token fuer **ihn** ausgestellt wurde. Bei Supabase steht
 * in `aud` immer `authenticated`, der Anspruch taugt dafuer also nicht. Gemessen am
 * 11.08.2026: ein Token aus dem OAuth-Fluss traegt zusaetzlich `client_id` und `scope`,
 * ein gewoehnliches Sitzungstoken der Hub-Oberflaeche nicht. Die Bindung laeuft deshalb
 * ueber `client_id` gegen `MCP_CLIENTS`. Das ist keine Bequemlichkeit, sondern der
 * eigentliche Zaun: ohne sie wuerde jedes beliebige Sitzungstoken des Hubs genuegen, und
 * jede Anwendung, die den Nutzer am Hub anmeldet, koennte damit in den MCP-Zugang.
 */

/** Wer angerufen hat. Haengt nach der Pruefung an der Anfrage. */
export interface McpAnrufer {
  /** Die Kennung, unter der Entwuerfe und Dateien abgelegt werden. */
  readonly benutzer: string;
  readonly art: "token" | "oauth";
}

declare module "fastify" {
  interface FastifyRequest {
    mcpAnrufer: McpAnrufer | null;
  }
}

/**
 * Der Eigentuemer, unter dem der feste Token ablegt.
 *
 * Ein eigener Namensraum mit Doppelpunkt: eine Supabase-Kennung ist eine UUID und kann
 * damit nie zusammenfallen.
 */
export const FESTER_BENUTZER = "token:fest";

/**
 * timingSafeEqual verlangt gleich lange Puffer und wirft sonst. Ein zu kurzes Token gaebe
 * damit einen 500er statt eines 401, und die Laenge waere verraten. Beide Seiten laufen
 * deshalb vorher durch sha256, das ergibt immer 32 Bytes. Dasselbe Vorgehen wie in
 * `auth/provider.ts`.
 */
function gleichZeitunabhaengig(a: string, b: string): boolean {
  const links = createHash("sha256").update(a, "utf8").digest();
  const rechts = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(links, rechts);
}

/** Der Pfad, unter dem die Metadaten zum Zugang stehen. Siehe `routes/wohlbekannt.ts`. */
export const METADATEN_PFAD = "/.well-known/oauth-protected-resource/api/mcp";

/**
 * Die Bereiche, die der Zugang verlangt.
 *
 * Ohne `offline_access`: das ist kein Erfordernis der Ressource, sondern der Wunsch des
 * Klienten nach einem Erneuerungstoken. Claude haengt es von sich aus an, weil der Hub es
 * in seinen Metadaten fuehrt.
 */
export const BEREICHE = "openid profile email";

/**
 * Die Aufforderung nach RFC 6750. Ohne sie findet claude.ai den Autorisierungsserver
 * nicht, und die Verbindung scheitert mit "Couldn't reach the MCP server", obwohl der
 * Server tadellos antwortet.
 */
function fordereAn(req: FastifyRequest, reply: FastifyReply, env: ServerEnv): void {
  const metadaten = `${wurzelVon(req, env)}${METADATEN_PFAD}`;
  void reply
    .code(401)
    .header(
      "www-authenticate",
      `Bearer resource_metadata="${metadaten}", scope="${BEREICHE}"`,
    )
    .send({
      code: "nicht-angemeldet",
      message: "A valid access token is required. See the resource metadata document.",
    });
}

/** Den Token aus der Kopfzeile ziehen. `Bearer` ist nach RFC 6750 ohne Ruecksicht auf Gross- und Kleinschreibung. */
function tokenAus(req: FastifyRequest): string | null {
  const kopf = req.headers.authorization;
  if (typeof kopf !== "string") return null;
  const treffer = /^Bearer\s+(.+)$/i.exec(kopf.trim());
  return treffer?.[1]?.trim() || null;
}

export function baueMcpWaechter(env: ServerEnv): preHandlerAsyncHookHandler {
  return async function waechter(req, reply) {
    if (!env.mcpAuth) {
      // Ausdruecklich abgeschaltet, siehe die Warnung beim Start in `env.ts`.
      req.mcpAnrufer = { benutzer: FESTER_BENUTZER, art: "token" };
      return;
    }

    const token = tokenAus(req);
    if (token === null) {
      fordereAn(req, reply, env);
      return reply;
    }

    if (env.mcpToken !== null && gleichZeitunabhaengig(token, env.mcpToken)) {
      req.mcpAnrufer = { benutzer: FESTER_BENUTZER, art: "token" };
      return;
    }

    /*
     * Ab hier kann es nur noch ein Token des Hubs sein. Jeder Fehlschlag endet in
     * derselben Antwort: abgelaufen, falsch signiert, fuer einen fremden Client
     * ausgestellt und frei erfunden sind fuer den Anrufer nicht zu unterscheiden.
     * Dieselbe Zurueckhaltung wie beim Download in `routes/mcp.ts`.
     */
    if (env.oidc === null) {
      fordereAn(req, reply, env);
      return reply;
    }

    try {
      const nutzlast = await pruefeJwt(env.oidc.aussteller, token);
      const client = nutzlast["client_id"];
      const sub = nutzlast["sub"];
      // `mcpClients` steht kleingeschrieben in der Umgebung, eine UUID kommt kleingeschrieben
      // vom Hub. Der Vergleich haengt trotzdem nicht daran, dass beides so bleibt.
      if (typeof client !== "string" || !env.mcpClients.includes(client.toLowerCase())) {
        throw new Error("Der Client des Tokens ist fuer den MCP-Zugang nicht zugelassen.");
      }
      if (typeof sub !== "string" || sub === "") {
        throw new Error("Dem Token fehlt die Kennung des Nutzers.");
      }
      req.mcpAnrufer = { benutzer: sub, art: "oauth" };
    } catch (fehler) {
      // Der Grund gehoert ins Protokoll, nicht in die Antwort.
      req.log.info({ fehler: (fehler as Error).message }, "MCP-Zugang abgewiesen");
      fordereAn(req, reply, env);
      return reply;
    }
    return;
  };
}

/**
 * Der geprüfte Anrufer. Wirft, wenn der Waechter nicht lief: das waere ein Fehler in der
 * Verdrahtung und darf nicht als "kein Benutzer" durchgehen.
 */
export function anruferVon(req: FastifyRequest): McpAnrufer {
  if (req.mcpAnrufer === null || req.mcpAnrufer === undefined) {
    throw new Error("Der MCP-Waechter lief nicht vor dieser Route.");
  }
  return req.mcpAnrufer;
}
