import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import type { ServerEnv } from "../env.js";
import { AppError } from "../errors.js";

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
 * Der Token ist die Adresse, **nicht mehr die Berechtigung**. Bis zum 11.08.2026 war er
 * beides: wer einen Entwurfs-Token kannte, konnte ihn lesen und ueberschreiben, gleich wer
 * ihn angelegt hatte. Solange der Zugang unangemeldet war, fiel das nicht auf, weil es
 * ohnehin nur einen Anrufer gab. Seit es angemeldete Nutzer gibt, waere es eine Luecke
 * zwischen ihnen, und deshalb traegt jeder Eintrag jetzt seinen Eigentuemer.
 *
 * Es gibt kein Verzeichnislisting, und 32 zufaellige Bytes sind nicht zu raten.
 */

/**
 * Wie lange ein Eintrag abrufbar bleibt.
 *
 * Je Ablage verschieden, seit dem 10.08.2026: eine Stunde war fuer einen Download-Link zu
 * knapp, wenn die Datei erst am naechsten Morgen abgeholt wird, und fuer einen Entwurf,
 * an dem noch gearbeitet wird, erst recht.
 */
export const TAG_MS = 24 * 60 * 60 * 1000;

/**
 * Obergrenzen je Ablage, gegen das Volllaufen des Volumes.
 *
 * Ohne diese Grenzen legt ein Anrufer in der 24-Stunden-Frist beliebig viele 25-MB-Anhaenge
 * ab, bis die Platte voll ist (Sicherheitsaudit 11.08.2026, mittlerer Befund). Sie gelten
 * weiter, seit der Zugang angemeldet ist: die Grenzen sind nicht gegen Unbekannte gerichtet,
 * sondern gegen ein volles Volume, und das laeuft mit Anmeldung genauso voll. Gedeckelt wird
 * an der Zahl **und** an der Summe: viele kleine Dateien fuellen sonst das Verzeichnis,
 * wenige grosse den Platz. Die Grenze gilt je Ablage, nicht je Nutzer.
 */
export const MAX_EINTRAEGE = 200;
export const MAX_GESAMT_BYTES = 500 * 1024 * 1024;

export interface AblageInfo {
  readonly token: string;
  readonly dateiname: string;
  readonly contentType: string;
  readonly groesse: number;
  readonly erstellt: number;
  /**
   * Ob noch Teile ausstehen.
   *
   * Nur beim stueckweisen Upload gesetzt. Wer sie liest, muss sie beachten: ein Eintrag mit
   * `unvollstaendig` traegt eine halbe Datei, sieht aber ansonsten wie jeder andere aus.
   * Genau daran haengt, dass kein halber Upload in einen Container geraet.
   */
  readonly unvollstaendig?: boolean;
  /** Die zuletzt angenommene Folgenummer. */
  readonly teil?: number;
}

export interface Abruf {
  readonly info: AblageInfo;
  readonly bytes: Buffer;
}

export interface Ablage {
  /** Wie lange ein Eintrag dieser Ablage gilt. */
  readonly lebensdauerMs: number;
  ablegen(datei: {
    bytes: Uint8Array;
    dateiname: string;
    contentType: string;
    /** Wem der Eintrag gehoert. Nur dieser Anrufer bekommt ihn je wieder zu sehen. */
    eigentuemer: string;
    unvollstaendig?: boolean;
    teil?: number;
  }): AblageInfo;
  /**
   * Der Eintrag, oder `null` fuer unbekannt, abgelaufen, verunstaltet **und fremd**.
   *
   * Die vier Faelle bekommen absichtlich dieselbe Antwort. Ein eigener Fehler fuer "gibt es,
   * gehoert aber jemand anderem" verriete, dass der Token echt ist, und damit genau das,
   * was der Token verbergen soll.
   */
  abrufen(token: string, eigentuemer: string, jetzt?: number): Abruf | null;
  /**
   * Neue Bytes unter demselben Token, mit **frischer** Frist.
   *
   * Gleitende Haltbarkeit, und das ist hier keine Bequemlichkeit: ein Entwurf, an dem
   * gerade gearbeitet wird, darf nicht mitten in der Arbeit ablaufen. `null` heisst, dass
   * der Token unbekannt, abgelaufen oder fremd war; dann entsteht auch keiner.
   *
   * `zusatz` schreibt den Zustand eines stueckweisen Uploads fort. Was nicht darin steht,
   * bleibt stehen; `unvollstaendig: false` schliesst ab.
   */
  aktualisieren(
    token: string,
    eigentuemer: string,
    bytes: Uint8Array,
    zusatz?: { unvollstaendig?: boolean; teil?: number },
    jetzt?: number,
  ): AblageInfo | null;
  /**
   * Einen Eintrag samt Bytes entfernen. Fuer einen Upload, der die Pruefung nicht besteht.
   * Ein fremder Eintrag bleibt unberuehrt.
   */
  verwerfen(token: string, eigentuemer: string): void;
  raeumeAuf(jetzt?: number): number;
}

interface Kopf {
  readonly dateiname: string;
  readonly contentType: string;
  readonly erstellt: number;
  /**
   * Wem der Eintrag gehoert.
   *
   * Optional im Typ, aber nicht in der Sache: seit dem 11.08.2026 schreibt `ablegen` das
   * Feld immer. Fehlt es, stammt der Eintrag aus der Zeit davor, und dann gehoert er
   * niemandem und ist damit fuer niemanden mehr abrufbar. Eine Wanderung braucht es dafuer
   * nicht, die Frist steht bei 24 Stunden.
   */
  readonly eigentuemer?: string;
  readonly unvollstaendig?: boolean;
  readonly teil?: number;
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

  /**
   * Weist einen neuen Eintrag ab, wenn die Ablage sonst zu voll wuerde. Zu rufen **nach**
   * `raeumeAuf`, damit Abgelaufenes nicht mitzaehlt. Der Fehler ist ein 507 (Insufficient
   * Storage) und kein 5xx-Serverfehler: der Grund ist bekannt und gehoert benannt, nicht
   * hinter "Unexpected server error" versteckt.
   */
  const pruefeQuote = (pfad: string, neueBytes: number): void => {
    let anzahl = 0;
    let summe = 0;
    for (const name of readdirSync(pfad)) {
      if (!name.endsWith(".bin")) continue;
      anzahl += 1;
      try {
        summe += statSync(resolve(pfad, name)).size;
      } catch {
        // Zwischen readdir und stat weggeraeumt: dann zaehlt die Datei eben nicht mit.
      }
    }
    if (anzahl >= MAX_EINTRAEGE || summe + neueBytes > MAX_GESAMT_BYTES) {
      throw new AppError(
        507,
        "ablage-voll",
        "The temporary storage is full. Try again later once entries have expired.",
      );
    }
  };

  return {
    lebensdauerMs,
    raeumeAuf,

    ablegen(datei) {
      const pfad = ordner();
      raeumeAuf();
      pruefeQuote(pfad, datei.bytes.byteLength);

      const token = neuerToken();
      const kopf: Kopf = {
        dateiname: datei.dateiname,
        contentType: datei.contentType,
        erstellt: Date.now(),
        eigentuemer: datei.eigentuemer,
        ...(datei.unvollstaendig === true ? { unvollstaendig: true } : {}),
        ...(datei.teil === undefined ? {} : { teil: datei.teil }),
      };
      // Erst die Bytes, dann der Kopf: der Kopf ist es, der einen Abruf erlaubt, und er
      // soll nie auf eine Datei zeigen, die es noch nicht ganz gibt.
      writeFileSync(resolve(pfad, `${token}.bin`), datei.bytes);
      writeFileSync(resolve(pfad, `${token}.json`), JSON.stringify(kopf), "utf8");

      return { token, ...kopf, groesse: datei.bytes.byteLength };
    },

    abrufen(token, eigentuemer, jetzt = Date.now()) {
      if (!istToken(token)) return null;
      const pfad = ordner();
      const kopf = liesKopf(pfad, token);
      if (kopf === null || jetzt - kopf.erstellt >= lebensdauerMs) return null;
      if (kopf.eigentuemer !== eigentuemer) return null;

      const bytesPfad = resolve(pfad, `${token}.bin`);
      if (!existsSync(bytesPfad)) return null;
      const bytes = readFileSync(bytesPfad);

      return { info: { token, ...kopf, groesse: bytes.byteLength }, bytes };
    },

    aktualisieren(token, eigentuemer, bytes, zusatz, jetzt = Date.now()) {
      if (!istToken(token)) return null;
      const pfad = ordner();
      const kopf = liesKopf(pfad, token);
      // Ein abgelaufener Token wird nicht wiederbelebt: sonst brauchte es nur einen
      // Patch, um einen Entwurf beliebig lange am Leben zu halten.
      if (kopf === null || jetzt - kopf.erstellt >= lebensdauerMs) return null;
      if (kopf.eigentuemer !== eigentuemer) return null;

      const neu: Kopf = { ...kopf, ...zusatz, erstellt: jetzt };
      // `unvollstaendig: false` gehoert nicht in die Datei, sondern heisst "Feld weg".
      // Sonst traegt ein abgeschlossener Upload fuer immer die Erinnerung daran.
      if (neu.unvollstaendig !== true) delete (neu as { unvollstaendig?: boolean }).unvollstaendig;

      writeFileSync(resolve(pfad, `${token}.bin`), bytes);
      writeFileSync(resolve(pfad, `${token}.json`), JSON.stringify(neu), "utf8");

      return { token, ...neu, groesse: bytes.byteLength };
    },

    verwerfen(token, eigentuemer) {
      if (!istToken(token)) return;
      const pfad = ordner();
      // Auch das Wegwerfen ist ein Zugriff: sonst loescht ein fremder Token den Entwurf
      // eines anderen, selbst wenn er ihn nie lesen konnte.
      if (liesKopf(pfad, token)?.eigentuemer !== eigentuemer) return;
      rmSync(resolve(pfad, `${token}.json`), { force: true });
      rmSync(resolve(pfad, `${token}.bin`), { force: true });
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
