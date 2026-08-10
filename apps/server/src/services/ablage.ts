import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ServerEnv } from "../env.js";

/**
 * Kurzlebige Dateiablage fuer den MCP-Server, in beide Richtungen.
 *
 * Der Chat kann keine Bytes anzeigen, er kann einen Link anklicken; und er kann keine
 * hochgeladene Datei weiterreichen, aber eine Kennung nennen. Beides ist derselbe
 * Mechanismus, nur andersherum, und steht deshalb einmal hier:
 *
 * - `ausgabe`  eine erzeugte AAS wartet auf ihren Download
 * - `anhaenge` eine hochgeladene Datei wartet darauf, in einen Container zu kommen
 *
 * **Kein Datenbankeintrag.** Die zwei Dateien sind der Eintrag: `<token>.json` haelt
 * Namen, Content-Type und Zeitpunkt, `<token>.bin` die Bytes. Beides zusammen ueberlebt
 * einen Neustart, ein Speicher-Map taete das nicht, und ein Link, der nach einem Deploy
 * ins Leere zeigt, waere die haesslichste Art, diese Funktion kaputt zu machen.
 *
 * Der Token ist die einzige Adresse. Es gibt kein Verzeichnislisting, und 32 zufaellige
 * Bytes sind nicht zu raten.
 */

/**
 * Wie lange ein Eintrag abrufbar bleibt.
 *
 * Je Ablage verschieden, seit dem 10.08.2026: eine Stunde war fuer einen Download-Link zu
 * knapp, wenn die Datei erst am naechsten Morgen abgeholt wird, und fuer einen Entwurf,
 * an dem noch gearbeitet wird, erst recht.
 */
export const TAG_MS = 24 * 60 * 60 * 1000;

export interface AblageInfo {
  readonly token: string;
  readonly dateiname: string;
  readonly contentType: string;
  readonly groesse: number;
  readonly erstellt: number;
}

export interface Abruf {
  readonly info: AblageInfo;
  readonly bytes: Buffer;
}

export interface Ablage {
  /** Wie lange ein Eintrag dieser Ablage gilt. */
  readonly lebensdauerMs: number;
  ablegen(datei: { bytes: Uint8Array; dateiname: string; contentType: string }): AblageInfo;
  /** Der Eintrag, oder `null` fuer unbekannt, abgelaufen und verunstaltet. */
  abrufen(token: string, jetzt?: number): Abruf | null;
  /**
   * Neue Bytes unter demselben Token, mit **frischer** Frist.
   *
   * Gleitende Haltbarkeit, und das ist hier keine Bequemlichkeit: ein Entwurf, an dem
   * gerade gearbeitet wird, darf nicht mitten in der Arbeit ablaufen. `null` heisst, dass
   * der Token unbekannt oder bereits abgelaufen war; dann entsteht auch keiner.
   */
  aktualisieren(
    token: string,
    bytes: Uint8Array,
    jetzt?: number,
  ): AblageInfo | null;
  raeumeAuf(jetzt?: number): number;
}

interface Kopf {
  readonly dateiname: string;
  readonly contentType: string;
  readonly erstellt: number;
}

/**
 * Nur was hier durchkommt, wird je an einen Pfad angehaengt.
 *
 * Ohne diese Pruefung waere `../../aas-editor.db` ein gueltiger Token und der
 * Download-Endpunkt ein Leseloch in das ganze Datenverzeichnis.
 */
export function istToken(wert: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(wert);
}

/**
 * base64url deshalb, und nicht hex: gleiche Zufallsmenge, kuerzerer Link. Geprueft wird
 * beim Abruf trotzdem noch einmal.
 */
function neuerToken(): string {
  return randomBytes(32).toString("base64url");
}

function liesKopf(pfad: string, token: string): Kopf | null {
  try {
    const roh = JSON.parse(readFileSync(resolve(pfad, `${token}.json`), "utf8")) as Kopf;
    if (typeof roh.erstellt !== "number") return null;
    return roh;
  } catch {
    // Halb geschriebene oder von Hand verunstaltete Koepfe gelten als abgelaufen.
    return null;
  }
}

function ablageIn(env: ServerEnv, verzeichnis: string, lebensdauerMs: number): Ablage {
  const ordner = () => {
    const pfad = resolve(env.dataDir, verzeichnis);
    mkdirSync(pfad, { recursive: true });
    return pfad;
  };

  /*
   * Aufgeraeumt wird beim Start und bei jedem Ablegen. Ein eigener Zeitgeber waere ein
   * Prozess mehr, der in Tests offen bleibt; solange die Ablage nur beim Schreiben
   * waechst, reicht es, beim Schreiben aufzuraeumen.
   */
  const raeumeAuf = (jetzt = Date.now()): number => {
    const pfad = ordner();
    let entfernt = 0;
    for (const name of readdirSync(pfad)) {
      if (!name.endsWith(".json")) continue;
      const token = name.slice(0, -".json".length);
      const kopf = liesKopf(pfad, token);
      if (kopf !== null && jetzt - kopf.erstellt < lebensdauerMs) continue;
      rmSync(resolve(pfad, `${token}.json`), { force: true });
      rmSync(resolve(pfad, `${token}.bin`), { force: true });
      entfernt += 1;
    }
    return entfernt;
  };

  return {
    lebensdauerMs,
    raeumeAuf,

    ablegen(datei) {
      const pfad = ordner();
      raeumeAuf();

      const token = neuerToken();
      const kopf: Kopf = {
        dateiname: datei.dateiname,
        contentType: datei.contentType,
        erstellt: Date.now(),
      };
      // Erst die Bytes, dann der Kopf: der Kopf ist es, der einen Abruf erlaubt, und er
      // soll nie auf eine Datei zeigen, die es noch nicht ganz gibt.
      writeFileSync(resolve(pfad, `${token}.bin`), datei.bytes);
      writeFileSync(resolve(pfad, `${token}.json`), JSON.stringify(kopf), "utf8");

      return { token, ...kopf, groesse: datei.bytes.byteLength };
    },

    abrufen(token, jetzt = Date.now()) {
      if (!istToken(token)) return null;
      const pfad = ordner();
      const kopf = liesKopf(pfad, token);
      if (kopf === null || jetzt - kopf.erstellt >= lebensdauerMs) return null;

      const bytesPfad = resolve(pfad, `${token}.bin`);
      if (!existsSync(bytesPfad)) return null;
      const bytes = readFileSync(bytesPfad);

      return { info: { token, ...kopf, groesse: bytes.byteLength }, bytes };
    },

    aktualisieren(token, bytes, jetzt = Date.now()) {
      if (!istToken(token)) return null;
      const pfad = ordner();
      const kopf = liesKopf(pfad, token);
      // Ein abgelaufener Token wird nicht wiederbelebt: sonst brauchte es nur einen
      // Patch, um einen Entwurf beliebig lange am Leben zu halten.
      if (kopf === null || jetzt - kopf.erstellt >= lebensdauerMs) return null;

      const neu: Kopf = { ...kopf, erstellt: jetzt };
      writeFileSync(resolve(pfad, `${token}.bin`), bytes);
      writeFileSync(resolve(pfad, `${token}.json`), JSON.stringify(neu), "utf8");

      return { token, ...neu, groesse: bytes.byteLength };
    },
  };
}

/** Erzeugte AAS-Dateien, die auf ihren Download warten. */
export const ausgabe = (env: ServerEnv): Ablage => ablageIn(env, "mcp-ausgabe", TAG_MS);

/** Hochgeladene Anhaenge, die auf ihren Container warten. */
export const anhaenge = (env: ServerEnv): Ablage => ablageIn(env, "mcp-anhaenge", TAG_MS);

/**
 * Entwuerfe, an denen gerade gearbeitet wird.
 *
 * Der Grund, warum es sie gibt: bis zum 10.08.2026 musste das ganze Environment bei jedem
 * Pruefen und jedem Erzeugen erneut uebertragen werden. Bei 34 KB und mehreren
 * Korrekturrunden ist das der groesste Posten ueberhaupt, und er entsteht nur, weil der
 * Server nichts behaelt.
 */
export const entwuerfe = (env: ServerEnv): Ablage => ablageIn(env, "mcp-entwuerfe", TAG_MS);
