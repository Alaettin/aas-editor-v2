import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Verschluesselung der Werte, die verschluesselt in der Datenbank liegen muessen.
 *
 * Heute nur der OpenAI-Schluessel. Warum ueberhaupt: die SQLite-Datei liegt auf einem
 * Volume, wird gesichert und wandert bei einem Fehler auch mal auf einen Rechner. Ein
 * fremder API-Schluessel im Klartext in einer Sicherungskopie ist eine Rechnung, die
 * jemand anders bezahlt.
 *
 * Der Schluessel wird aus `SESSION_SECRET` abgeleitet, es gibt also **kein** zweites
 * Geheimnis zu verwalten. Preis dafuer: wer SESSION_SECRET wechselt, macht den
 * hinterlegten API-Schluessel unlesbar. Das ist gewollt und faellt sofort auf, weil
 * `entschluesseln` dann `null` liefert und die Oberflaeche wieder "nicht verbunden"
 * zeigt, statt still etwas Falsches zu senden.
 *
 * AES-256-GCM, weil das Ergebnis nicht nur geheim, sondern auch unveraendert sein muss:
 * ein Angreifer mit Schreibzugriff auf die Datei koennte den Schluessel sonst auf seinen
 * eigenen umbiegen und die Anfragen des Nutzers auf seine Rechnung umlenken.
 */

const ALGORITHMUS = "aes-256-gcm";
const SALZ = "aas-editor:einstellungen:v1";
const IV_LAENGE = 12;
const MARKE_LAENGE = 16;

function ableiten(sessionSecret: string): Buffer {
  return scryptSync(sessionSecret, SALZ, 32);
}

/** Liefert `iv.marke.geheimtext`, alles base64url, damit es in eine Textspalte passt. */
export function verschluesseln(klartext: string, sessionSecret: string): string {
  const iv = randomBytes(IV_LAENGE);
  const cipher = createCipheriv(ALGORITHMUS, ableiten(sessionSecret), iv);
  const geheim = Buffer.concat([cipher.update(klartext, "utf8"), cipher.final()]);
  const marke = cipher.getAuthTag();
  return [iv, marke, geheim].map((teil) => teil.toString("base64url")).join(".");
}

/**
 * Gibt `null` statt zu werfen: ein nicht mehr lesbarer Wert ist ein normaler Zustand
 * (SESSION_SECRET gewechselt) und keine Stoerung, die den Aufruf abbrechen muss.
 */
export function entschluesseln(gespeichert: string, sessionSecret: string): string | null {
  const teile = gespeichert.split(".");
  if (teile.length !== 3) return null;

  try {
    const [iv, marke, geheim] = teile.map((teil) => Buffer.from(teil, "base64url")) as [
      Buffer,
      Buffer,
      Buffer,
    ];
    if (iv.length !== IV_LAENGE || marke.length !== MARKE_LAENGE) return null;

    const decipher = createDecipheriv(ALGORITHMUS, ableiten(sessionSecret), iv);
    decipher.setAuthTag(marke);
    return Buffer.concat([decipher.update(geheim), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
