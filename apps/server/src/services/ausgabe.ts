import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ServerEnv } from "../env.js";

/**
 * Kurzlebige Dateiablage fuer den MCP-Server.
 *
 * Der Chat kann keine Bytes anzeigen, er kann einen Link anklicken. Eine erzeugte AAS
 * landet deshalb fuer eine Stunde auf der Platte, und das Werkzeug gibt die Adresse
 * zurueck.
 *
 * **Kein Datenbankeintrag.** Die zwei Dateien sind der Eintrag: `<token>.json` haelt
 * Namen, Content-Type und Zeitpunkt, `<token>.bin` die Bytes. Beides zusammen ueberlebt
 * einen Neustart, ein Speicher-Map taete das nicht, und ein Link, der nach einem Deploy
 * ins Leere zeigt, waere die haesslichste Art, diese Funktion kaputt zu machen.
 *
 * Der Token ist die einzige Adresse. Es gibt kein Verzeichnislisting, und 32 zufaellige
 * Bytes sind nicht zu raten.
 */

const VERZEICHNIS = "mcp-ausgabe";

/** Wie lange eine erzeugte Datei abrufbar bleibt. */
export const LEBENSDAUER_MS = 60 * 60 * 1000;

export interface AblageInfo {
  readonly token: string;
  readonly dateiname: string;
  readonly contentType: string;
  readonly groesse: number;
  readonly erstellt: number;
}

interface Kopf {
  readonly dateiname: string;
  readonly contentType: string;
  readonly erstellt: number;
}

function ordner(env: ServerEnv): string {
  const pfad = resolve(env.dataDir, VERZEICHNIS);
  mkdirSync(pfad, { recursive: true });
  return pfad;
}

/**
 * Ein Token, das sich gefahrlos als Dateiname verwenden laesst.
 *
 * base64url deshalb, und nicht hex: gleiche Zufallsmenge, kuerzerer Link. Geprueft wird
 * beim Abruf trotzdem noch einmal, siehe `istToken`.
 */
function neuerToken(): string {
  return randomBytes(32).toString("base64url");
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
 * Wirft alles hinaus, was seine Stunde hinter sich hat.
 *
 * Laeuft beim Start und bei jedem Ablegen. Ein eigener Zeitgeber waere ein Prozess mehr,
 * der in Tests offen bleibt; solange die Ablage nur beim Schreiben waechst, reicht es,
 * beim Schreiben aufzuraeumen.
 */
export function raeumeAuf(env: ServerEnv, jetzt = Date.now()): number {
  const pfad = ordner(env);
  let entfernt = 0;
  for (const name of readdirSync(pfad)) {
    if (!name.endsWith(".json")) continue;
    const token = name.slice(0, -".json".length);
    const kopf = liesKopf(pfad, token);
    if (kopf !== null && jetzt - kopf.erstellt < LEBENSDAUER_MS) continue;
    rmSync(resolve(pfad, `${token}.json`), { force: true });
    rmSync(resolve(pfad, `${token}.bin`), { force: true });
    entfernt += 1;
  }
  return entfernt;
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

export function ablegen(
  env: ServerEnv,
  datei: { bytes: Uint8Array; dateiname: string; contentType: string },
): AblageInfo {
  const pfad = ordner(env);
  raeumeAuf(env);

  const token = neuerToken();
  const kopf: Kopf = {
    dateiname: datei.dateiname,
    contentType: datei.contentType,
    erstellt: Date.now(),
  };
  // Erst die Bytes, dann der Kopf: der Kopf ist es, der einen Abruf erlaubt, und er soll
  // nie auf eine Datei zeigen, die es noch nicht ganz gibt.
  writeFileSync(resolve(pfad, `${token}.bin`), datei.bytes);
  writeFileSync(resolve(pfad, `${token}.json`), JSON.stringify(kopf), "utf8");

  return { token, ...kopf, groesse: datei.bytes.byteLength };
}

export interface Abruf {
  readonly info: AblageInfo;
  readonly bytes: Buffer;
}

/** Die abgelegte Datei, oder `null` fuer unbekannt, abgelaufen und verunstaltet. */
export function abrufen(env: ServerEnv, token: string, jetzt = Date.now()): Abruf | null {
  if (!istToken(token)) return null;
  const pfad = ordner(env);
  const kopf = liesKopf(pfad, token);
  if (kopf === null || jetzt - kopf.erstellt >= LEBENSDAUER_MS) return null;

  const bytesPfad = resolve(pfad, `${token}.bin`);
  if (!existsSync(bytesPfad)) return null;
  const bytes = readFileSync(bytesPfad);

  return { info: { token, ...kopf, groesse: bytes.byteLength }, bytes };
}
