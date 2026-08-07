import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { ServerEnv } from "../env.js";
import {
  baueAnmeldeadresse,
  neuerVerifizierer,
  neuerZufall,
  pruefeIdToken,
  tauscheCode,
  type Konfiguration,
} from "./oidc.js";
import { readSession } from "./session.js";

/**
 * Die gesamte Anmeldelogik liegt hinter diesem Interface, in genau dieser Datei.
 *
 * Am 28.07.2026 stand hier, ein Wechsel auf OIDC koste "nur diese eine Datei". Das war
 * beim Umbau am 07.08.2026 **nicht** ganz richtig, und zwar aus einem sachlichen Grund:
 * `verifyCredentials(benutzer, passwort)` beschreibt ein Formular. Ein
 * Authorization-Code-Flow ist eine Umleitung mit Rueckweg, und das passt nicht in
 * dieselbe Form. Der Schnitt war trotzdem richtig: **das Interface waechst, die Routen
 * und die Oberflaeche bleiben duenn**, und keine Route weiss, wie angemeldet wird.
 *
 * Zwei Spielarten, unterschieden ueber `art`:
 *
 *   passwort  Ein Benutzer, Zugangsdaten aus der .env, keine Benutzertabelle.
 *             Bleibt als Rueckfallebene. Nicht aus Bequemlichkeit: geht am Hub etwas
 *             schief, ist der Editor sonst fuer niemanden mehr erreichbar.
 *   oidc      AXON Studio ist der Aussteller. Der Editor haelt weiterhin sein eigenes
 *             Sitzungscookie; getauscht wird nur, **woher** die Identitaet kommt.
 */

export interface AuthUser {
  readonly id: string;
  readonly name: string;
}

/** Was ein Anmeldeversuch fuer die Dauer der Umleitung mitfuehren muss. */
export interface AnmeldeAnlauf {
  readonly adresse: string;
  readonly state: string;
  readonly verifizierer: string;
  readonly nonce: string;
}

interface Gemeinsam {
  getUserFromRequest(req: FastifyRequest): Promise<AuthUser | null>;
}

export interface PasswortProvider extends Gemeinsam {
  readonly art: "passwort";
  verifyCredentials(user: string, password: string): Promise<AuthUser | null>;
}

export interface OidcProvider extends Gemeinsam {
  readonly art: "oidc";
  beginneAnmeldung(): Promise<AnmeldeAnlauf>;
  schliesseAnmeldung(code: string, verifizierer: string, nonce: string): Promise<AuthUser>;
}

export type AuthProvider = PasswortProvider | OidcProvider;

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
export class EnvAuthProvider implements PasswortProvider {
  readonly art = "passwort" as const;

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

/**
 * AXON Studio als Aussteller.
 *
 * `getUserFromRequest` fragt **nicht** beim Hub nach. Die Sitzung ist das signierte
 * Cookie des Editors, wie bisher; das ID-Token wird einmal beim Anmelden geprueft und
 * danach nicht mehr gebraucht. Das hat eine Folge, die benannt gehoert: nimmt der Hub
 * einem Nutzer die Freischaltung, wirkt das erst, wenn dessen Editor-Sitzung ablaeuft.
 * Eine Nachfrage bei jedem Aufruf waere die Alternative, sie kostet einen Netzaufruf je
 * Anfrage. Bis das entschieden ist, gilt die kurze Antwort: der Hub entscheidet, wer
 * **hereinkommt**, nicht im Minutentakt, wer drinnen bleibt.
 */
export class OidcAuthProvider implements OidcProvider {
  readonly art = "oidc" as const;

  constructor(private readonly konf: Konfiguration) {}

  async beginneAnmeldung(): Promise<AnmeldeAnlauf> {
    const { verifizierer, abdruck } = neuerVerifizierer();
    const state = neuerZufall();
    const nonce = neuerZufall();
    const adresse = await baueAnmeldeadresse(this.konf, state, abdruck, nonce);
    return { adresse, state, verifizierer, nonce };
  }

  async schliesseAnmeldung(
    code: string,
    verifizierer: string,
    nonce: string,
  ): Promise<AuthUser> {
    const { idToken } = await tauscheCode(this.konf, code, verifizierer);
    const anspruch = await pruefeIdToken(this.konf, idToken, nonce);
    return {
      id: anspruch.sub,
      // Der Anzeigename, mit absteigender Genauigkeit. Die Kennung ist der letzte Ausweg,
      // aber besser als ein leeres Feld in der Titelzeile.
      name: anspruch.name ?? anspruch.email ?? anspruch.sub,
    };
  }

  getUserFromRequest(req: FastifyRequest): Promise<AuthUser | null> {
    const session = readSession(req);
    if (session === null) return Promise.resolve(null);
    return Promise.resolve({ id: session.sub, name: session.name ?? session.sub });
  }
}
