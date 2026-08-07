import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
// `JsonWebKey` steht global nur in lib.dom, und die hat der Server nicht. Node fuehrt den
// Typ unter `webcrypto`, nicht auf der obersten Ebene des Moduls.
import type { webcrypto } from "node:crypto";

/**
 * Der OpenID-Connect-Teil: Entdeckung, Codetausch und Pruefung des ID-Tokens.
 *
 * **Ohne neue Abhaengigkeit.** Node bringt `crypto.subtle` mit, und mehr braucht die
 * Pruefung einer ES256-Signatur nicht. Eine Bibliothek fuer JOSE waere hier ein grosses
 * Paket fuer dreissig Zeilen, und sie ginge in genau die Schicht, in der ein Fehler alles
 * betrifft. Was hier steht, ist deshalb absichtlich klein und vollstaendig lesbar.
 *
 * Der Aussteller ist AXON Studio, der Hub. Er signiert mit ES256; das ist keine Annahme,
 * sondern steht in seinem JWKS und wird unten am `kid` festgemacht.
 */

/** Was die Entdeckung liefert, soweit es hier gebraucht wird. */
interface Entdeckung {
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly jwks_uri: string;
}

interface Jwk {
  readonly kid: string;
  readonly alg?: string;
  readonly kty: string;
  readonly crv?: string;
  readonly x?: string;
  readonly y?: string;
  readonly n?: string;
  readonly e?: string;
}

/** Die Ansprueche, die uns interessieren. */
export interface IdToken {
  readonly iss: string;
  readonly aud: string | readonly string[];
  readonly sub: string;
  readonly exp: number;
  readonly iat: number;
  readonly nonce?: string;
  readonly email?: string;
  readonly name?: string;
}

export class OidcFehler extends Error {}

/**
 * Entdeckung und JWKS werden gemerkt.
 *
 * Nicht aus Sparsamkeit: ohne das holte **jede** Anmeldung zwei Dokumente vom Hub, und
 * faellt er kurz aus, kommt niemand mehr herein, obwohl sich an den Schluesseln nichts
 * geaendert hat. Die Frist ist kurz genug, dass ein Schluesselwechsel binnen einer Stunde
 * ankommt.
 */
const GEDAECHTNIS_MS = 60 * 60 * 1000;

let entdeckung: { wert: Entdeckung; bis: number } | null = null;
let schluessel: { wert: Jwk[]; bis: number } | null = null;

async function holeJson(url: string): Promise<unknown> {
  const antwort = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!antwort.ok) throw new OidcFehler(`${url} antwortete mit ${String(antwort.status)}.`);
  return await antwort.json();
}

export async function holeEntdeckung(aussteller: string): Promise<Entdeckung> {
  if (entdeckung && entdeckung.bis > Date.now()) return entdeckung.wert;
  // Der OIDC-Pfad, nicht der OAuth-Pfad: nur er nennt das jwks_uri verlaesslich.
  const wert = (await holeJson(
    `${aussteller.replace(/\/$/, "")}/.well-known/openid-configuration`,
  )) as Entdeckung;
  if (!wert.token_endpoint || !wert.jwks_uri || !wert.authorization_endpoint) {
    throw new OidcFehler("Die Entdeckung des Ausstellers ist unvollstaendig.");
  }
  entdeckung = { wert, bis: Date.now() + GEDAECHTNIS_MS };
  return wert;
}

async function holeSchluessel(jwksUri: string, kid: string): Promise<Jwk> {
  if (!schluessel || schluessel.bis <= Date.now()) {
    const { keys } = (await holeJson(jwksUri)) as { keys: Jwk[] };
    schluessel = { wert: keys, bis: Date.now() + GEDAECHTNIS_MS };
  }
  const treffer = schluessel.wert.find((k) => k.kid === kid);
  if (treffer) return treffer;

  /*
   * Unbekanntes kid heisst meistens: der Aussteller hat gewechselt und unser Vorrat ist
   * alt. Einmal neu holen, aber nur einmal: sonst waere ein erfundenes kid eine Einladung,
   * den Hub im Takt der Anfragen zu befragen.
   */
  const { keys } = (await holeJson(jwksUri)) as { keys: Jwk[] };
  schluessel = { wert: keys, bis: Date.now() + GEDAECHTNIS_MS };
  const zweiter = schluessel.wert.find((k) => k.kid === kid);
  if (!zweiter) throw new OidcFehler(`Kein Schluessel mit der Kennung ${kid} im JWKS.`);
  return zweiter;
}

/** PKCE: ein Verifizierer und sein Abdruck. */
export function neuerVerifizierer(): { verifizierer: string; abdruck: string } {
  const verifizierer = randomBytes(32).toString("base64url");
  const abdruck = createHash("sha256").update(verifizierer).digest("base64url");
  return { verifizierer, abdruck };
}

export function neuerZufall(): string {
  return randomBytes(16).toString("base64url");
}

/** Zeitunabhaengiger Vergleich fuer `state` und `nonce`. */
export function gleich(a: string, b: string): boolean {
  const links = createHash("sha256").update(a, "utf8").digest();
  const rechts = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(links, rechts);
}

export interface Konfiguration {
  readonly aussteller: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly rueckweg: string;
}

export async function baueAnmeldeadresse(
  konf: Konfiguration,
  state: string,
  abdruck: string,
  nonce: string,
): Promise<string> {
  const { authorization_endpoint } = await holeEntdeckung(konf.aussteller);
  const felder = new URLSearchParams({
    client_id: konf.clientId,
    redirect_uri: konf.rueckweg,
    response_type: "code",
    scope: "openid email profile",
    code_challenge: abdruck,
    code_challenge_method: "S256",
    state,
    nonce,
  });
  return `${authorization_endpoint}?${felder.toString()}`;
}

/**
 * Codetausch, **vertraulich**: die Zugangsdaten des Clients gehen als Basic-Auth mit, und
 * das geschieht hier im Server. Das Token verlaesst ihn nie, der Browser behaelt sein
 * httpOnly-Sitzungscookie. Ein oeffentlicher Client legte das Token in den Browser und
 * waere gegenueber dem bisherigen Stand ein Rueckschritt.
 */
export async function tauscheCode(
  konf: Konfiguration,
  code: string,
  verifizierer: string,
): Promise<{ idToken: string }> {
  const { token_endpoint } = await holeEntdeckung(konf.aussteller);
  const basic = Buffer.from(`${konf.clientId}:${konf.clientSecret}`).toString("base64");

  const antwort = await fetch(token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: konf.rueckweg,
      code_verifier: verifizierer,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const rumpf = (await antwort.json()) as { id_token?: string; error_description?: string };
  if (!antwort.ok || !rumpf.id_token) {
    throw new OidcFehler(rumpf.error_description ?? `Codetausch scheiterte (${String(antwort.status)}).`);
  }
  return { idToken: rumpf.id_token };
}

function base64urlZuJson(teil: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(teil, "base64url").toString("utf8")) as Record<string, unknown>;
}

/**
 * Prueft das ID-Token vollstaendig: Signatur, Aussteller, Empfaenger, Ablauf und `nonce`.
 *
 * Die Reihenfolge ist Absicht. Erst die Signatur, dann der Inhalt: alles andere hiesse,
 * Ansprueche zu glauben, die noch niemand beglaubigt hat.
 */
export async function pruefeIdToken(
  konf: Konfiguration,
  idToken: string,
  nonce: string,
): Promise<IdToken> {
  const teile = idToken.split(".");
  if (teile.length !== 3) throw new OidcFehler("Das ID-Token hat nicht drei Teile.");
  const [kopfTeil, nutzlastTeil, signaturTeil] = teile as [string, string, string];

  const kopf = base64urlZuJson(kopfTeil) as { alg?: string; kid?: string };
  if (!kopf.kid) throw new OidcFehler("Dem ID-Token fehlt die Schluesselkennung.");
  if (kopf.alg !== "ES256" && kopf.alg !== "RS256") {
    // HS256 waere symmetrisch: der Aussteller und wir teilten dann ein Geheimnis, und
    // jeder, der es hat, koennte Token erfinden. Der Hub steht auf ES256.
    throw new OidcFehler(`Unerwartetes Signaturverfahren: ${String(kopf.alg)}.`);
  }

  const { jwks_uri, issuer } = await holeEntdeckung(konf.aussteller);
  const jwk = await holeSchluessel(jwks_uri, kopf.kid);

  const istEc = kopf.alg === "ES256";
  const schluesselObjekt = await crypto.subtle.importKey(
    "jwk",
    jwk as webcrypto.JsonWebKey,
    istEc
      ? { name: "ECDSA", namedCurve: "P-256" }
      : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const gueltig = await crypto.subtle.verify(
    istEc ? { name: "ECDSA", hash: "SHA-256" } : { name: "RSASSA-PKCS1-v1_5" },
    schluesselObjekt,
    Buffer.from(signaturTeil, "base64url"),
    Buffer.from(`${kopfTeil}.${nutzlastTeil}`),
  );
  if (!gueltig) throw new OidcFehler("Die Signatur des ID-Tokens stimmt nicht.");

  const nutzlast = base64urlZuJson(nutzlastTeil) as unknown as IdToken;

  if (nutzlast.iss !== issuer) {
    throw new OidcFehler(`Fremder Aussteller: ${String(nutzlast.iss)}.`);
  }
  const empfaenger = Array.isArray(nutzlast.aud) ? nutzlast.aud : [nutzlast.aud];
  if (!empfaenger.includes(konf.clientId)) {
    throw new OidcFehler("Das ID-Token ist nicht fuer diesen Client ausgestellt.");
  }
  // Eine Minute Nachsicht fuer auseinanderlaufende Uhren, mehr nicht.
  const jetzt = Math.floor(Date.now() / 1000);
  if (typeof nutzlast.exp !== "number" || nutzlast.exp + 60 < jetzt) {
    throw new OidcFehler("Das ID-Token ist abgelaufen.");
  }
  if (typeof nutzlast.iat === "number" && nutzlast.iat - 60 > jetzt) {
    throw new OidcFehler("Das ID-Token stammt aus der Zukunft.");
  }
  if (!nutzlast.nonce || !gleich(nutzlast.nonce, nonce)) {
    // Ohne diese Pruefung koennte ein aufgefangenes Token ein zweites Mal eingeloest
    // werden. Der nonce bindet es an genau diesen Anmeldeversuch.
    throw new OidcFehler("Der nonce des ID-Tokens gehoert nicht zu diesem Anmeldeversuch.");
  }
  if (!nutzlast.sub) throw new OidcFehler("Dem ID-Token fehlt die Kennung des Nutzers.");

  return nutzlast;
}

/** Nur fuer Tests: den Vorrat leeren, damit ein Lauf den naechsten nicht beeinflusst. */
export function vergissVorrat(): void {
  entdeckung = null;
  schluessel = null;
}
