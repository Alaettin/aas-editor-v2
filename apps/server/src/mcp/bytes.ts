import { createHash } from "node:crypto";

/**
 * Bytes annehmen, ohne sie stillschweigend zu verstuemmeln.
 *
 * Der Anlass ist handfest. `Buffer.from(text, "base64")` hoert beim ersten Zeichen, das
 * nicht ins Alphabet gehoert, einfach auf zu dekodieren: kein Fehler, kein Hinweis, nur
 * weniger Bytes. In einer echten Sitzung am 10.08.2026 sind so **zweimal** halbe Bilder in
 * die Ablage gewandert, jedes mit einem Token und einer Erfolgsmeldung quittiert.
 * Aufgefallen ist es allein deshalb, weil der Aufrufer die Groesse der Quelldatei im Kopf
 * hatte.
 *
 * Dagegen stehen hier drei Pruefungen, von billig nach teuer:
 *
 * 1. das base64 selbst, **vor** dem Dekodieren
 * 2. Kopf und Fuss der Bytes gegen den angegebenen contentType
 * 3. `groesse` und `sha256`, sofern der Aufrufer sie zusagt
 *
 * Die zweite ist die, die den Fall von damals gefangen haette: ein JPEG ohne seinen
 * EOI-Marker ist abgeschnitten, und das steht in den letzten zwei Bytes.
 */

/** Was schiefgehen kann, in der Sprache der Werkzeuge: ein Grund und ein Rat. */
export interface BytesFehler {
  readonly grund: string;
  readonly hinweis?: string;
}

export function istBytesFehler(wert: unknown): wert is BytesFehler {
  return typeof wert === "object" && wert !== null && "grund" in wert;
}

// --- base64 ----------------------------------------------------------------------------

const BASE64_ZEICHEN = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * base64 zu Bytes, streng.
 *
 * Leerraum und Zeilenumbrueche werden entfernt, ein `data:`-Praefix abgeschnitten; alles
 * andere muss stimmen. Ein einzelnes falsches Zeichen ist ein Fehler und keine Einladung,
 * den Rest wegzuwerfen.
 */
export function ausBase64(roh: string): Uint8Array | BytesFehler {
  const ohnePraefix = roh.replace(/^data:[^,]*,/, "");
  const text = ohnePraefix.replace(/\s+/g, "");

  if (text === "") return { grund: "base64 ist leer." };

  if (!BASE64_ZEICHEN.test(text)) {
    // Die Stelle mitzuliefern erspart das Raten. Sie ist auch der Beweis, dass hier
    // nicht einfach abgeschnitten wurde: wer die Zahl sieht, weiss, wo seine Uebertragung
    // gerissen ist.
    const stelle = text.search(/[^A-Za-z0-9+/=]/);
    const zeichen = stelle >= 0 ? text[stelle] : "";
    return {
      grund:
        `base64 enthaelt an Stelle ${stelle} das ungueltige Zeichen ${JSON.stringify(zeichen)}.`,
      hinweis:
        "Node bricht an dieser Stelle still ab und liefert zu wenige Bytes. Die " +
        "Uebertragung ist vermutlich abgeschnitten; vollstaendig neu senden oder " +
        "anhang_hochladen stueckweise mit teil und sha256 nutzen.",
    };
  }

  if (text.length % 4 !== 0) {
    return {
      grund: `base64 ist ${text.length} Zeichen lang, das ist nicht durch vier teilbar.`,
      hinweis:
        "Ein angefangener Viererblock heisst abgeschnittene Uebertragung. Vollstaendig " +
        "neu senden oder anhang_hochladen stueckweise nutzen.",
    };
  }

  // Ein `=` darf nur am Ende stehen. Das Muster oben laesst `AB=C` durch, Node ebenso,
  // und heraus kaeme wieder zu wenig.
  const fuellung = text.indexOf("=");
  if (fuellung >= 0 && fuellung < text.length - 2) {
    return { grund: "In base64 steht ein Fuellzeichen \"=\" vor dem Ende." };
  }

  return new Uint8Array(Buffer.from(text, "base64"));
}

// --- Kopf und Fuss ---------------------------------------------------------------------

interface Signatur {
  /** Erwarteter Dateikopf. Mehrere, wenn ein Typ verschieden anfangen darf. */
  readonly koepfe: readonly (readonly number[])[];
  /**
   * Erwarteter Abschluss. Fehlt er, bricht die Datei ab, und genau das ist der Fall aus
   * der echten Sitzung.
   */
  readonly fuss?: {
    readonly bytes: readonly number[];
    /** Wie weit vom Ende gesucht wird. Ein ZIP traegt hinter der EOCD noch einen Kommentar. */
    readonly fenster: number;
    readonly name: string;
  };
  readonly name: string;
}

const ZIP: Signatur = {
  // Ein leeres Archiv faengt mit `PK\x05\x06` an, ein gespanntes mit `PK\x07\x08`.
  koepfe: [
    [0x50, 0x4b, 0x03, 0x04],
    [0x50, 0x4b, 0x05, 0x06],
    [0x50, 0x4b, 0x07, 0x08],
  ],
  fuss: { bytes: [0x50, 0x4b, 0x05, 0x06], fenster: 66_000, name: "End of Central Directory" },
  name: "ZIP",
};

/**
 * Kopf und Fuss je Typ.
 *
 * Nicht jeder Typ steht hier: `text/plain`, `text/csv` und `application/json` haben keine
 * Signatur, die etwas belegen wuerde. Was fehlt, wird nicht geprueft, und das ist ehrlicher
 * als eine Pruefung, die immer zustimmt.
 */
const SIGNATUREN: Readonly<Record<string, Signatur>> = {
  "image/jpeg": {
    koepfe: [[0xff, 0xd8, 0xff]],
    fuss: { bytes: [0xff, 0xd9], fenster: 4, name: "EOI-Marker" },
    name: "JPEG",
  },
  "image/png": {
    koepfe: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    // "IEND" samt seiner CRC schliesst jede PNG-Datei ab.
    fuss: { bytes: [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82], fenster: 8, name: "IEND-Block" },
    name: "PNG",
  },
  "image/gif": {
    koepfe: [
      [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
      [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
    ],
    fuss: { bytes: [0x3b], fenster: 1, name: "Trailer" },
    name: "GIF",
  },
  "image/webp": {
    // "RIFF", dann vier Byte Laenge, dann "WEBP". Der Sprung wird unten behandelt.
    koepfe: [[0x52, 0x49, 0x46, 0x46]],
    name: "WebP",
  },
  "image/tiff": {
    koepfe: [
      [0x49, 0x49, 0x2a, 0x00],
      [0x4d, 0x4d, 0x00, 0x2a],
    ],
    name: "TIFF",
  },
  "application/pdf": {
    koepfe: [[0x25, 0x50, 0x44, 0x46, 0x2d]],
    // "%%EOF", mit Spielraum fuer die Zeilenenden dahinter.
    fuss: { bytes: [0x25, 0x25, 0x45, 0x4f, 0x46], fenster: 1024, name: "%%EOF" },
    name: "PDF",
  },
  "application/zip": ZIP,
  "application/aas+zip": ZIP,
};

function beginntMit(bytes: Uint8Array, muster: readonly number[]): boolean {
  if (bytes.byteLength < muster.length) return false;
  return muster.every((b, i) => bytes[i] === b);
}

/** Ob das Muster in den letzten `fenster` Bytes steht. */
function endetAuf(bytes: Uint8Array, muster: readonly number[], fenster: number): boolean {
  const ab = Math.max(0, bytes.byteLength - Math.max(fenster, muster.length));
  const raum = bytes.subarray(ab);
  for (let i = raum.byteLength - muster.length; i >= 0; i -= 1) {
    if (muster.every((b, k) => raum[i + k] === b)) return true;
  }
  return false;
}

/** Der Typ, auf den die Bytes tatsaechlich zeigen. Fuer die Fehlermeldung. */
function erkannterTyp(bytes: Uint8Array): string | null {
  for (const signatur of Object.values(SIGNATUREN)) {
    if (signatur.koepfe.some((kopf) => beginntMit(bytes, kopf))) return signatur.name;
  }
  // XML und SVG haben keinen Kopf im engeren Sinn, aber ein erstes sichtbares Zeichen.
  if (istTextMitSpitzKlammer(bytes)) return "XML oder SVG";
  return null;
}

/**
 * Ob der Text nach BOM und Leerraum mit `<` beginnt.
 *
 * Genug fuer XML und SVG. Mehr waere ein Parser, und der gehoert nicht in eine
 * Plausibilitaetspruefung.
 */
function istTextMitSpitzKlammer(bytes: Uint8Array): boolean {
  let i = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  while (i < bytes.byteLength && (bytes[i] === 0x20 || (bytes[i]! >= 0x09 && bytes[i]! <= 0x0d))) {
    i += 1;
  }
  return bytes[i] === 0x3c;
}

const XML_TYPEN = new Set(["image/svg+xml", "application/xml", "text/xml"]);

/**
 * Passen die Bytes zum angegebenen Typ, und sind sie vollstaendig?
 *
 * `null` heisst: in Ordnung, oder es gibt fuer diesen Typ nichts zu pruefen.
 */
export function pruefeSignatur(
  bytes: Uint8Array,
  contentType: string,
  bezeichnung: string,
): BytesFehler | null {
  const typ = contentType.split(";")[0]?.trim().toLowerCase() ?? "";

  if (XML_TYPEN.has(typ)) {
    if (!istTextMitSpitzKlammer(bytes)) {
      return {
        grund: `"${bezeichnung}" ist als ${typ} angegeben, beginnt aber nicht mit "<".`,
        hinweis: "Entweder stimmt der contentType nicht, oder die Bytes sind keine XML-Datei.",
      };
    }
    return null;
  }

  const signatur = SIGNATUREN[typ];
  if (signatur === undefined) return null;

  if (!signatur.koepfe.some((kopf) => beginntMit(bytes, kopf))) {
    const wirklich = erkannterTyp(bytes);
    return {
      grund:
        `"${bezeichnung}" ist als ${typ} angegeben, traegt aber keinen ${signatur.name}-Kopf` +
        (wirklich === null ? "." : `, sondern sieht nach ${wirklich} aus.`),
      hinweis:
        "Entweder der contentType oder die Bytes sind falsch. Nicht abgelegt, damit " +
        "kein falsch benannter Anhang in einen Container geraet.",
    };
  }

  // WebP: nach "RIFF" und vier Byte Laenge muss "WEBP" stehen.
  if (typ === "image/webp" && !beginntMit(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])) {
    return { grund: `"${bezeichnung}" traegt einen RIFF-Kopf, aber keine WEBP-Kennung.` };
  }

  const fuss = signatur.fuss;
  if (fuss !== undefined && !endetAuf(bytes, fuss.bytes, fuss.fenster)) {
    return {
      grund:
        `"${bezeichnung}" bricht ab: der ${fuss.name} am Ende der ${signatur.name}-Datei fehlt.`,
      hinweis:
        `Angekommen sind ${bytes.byteLength} Bytes. Das ist das Bild einer abgeschnittenen ` +
        "Uebertragung. Vollstaendig neu senden, besser ueber die url-Quelle oder " +
        "stueckweise mit teil und sha256.",
    };
  }

  return null;
}

// --- Zusagen des Aufrufers -------------------------------------------------------------

export function sha256Von(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Prueft `groesse` und `sha256`, sofern zugesagt.
 *
 * Beide sind freiwillig: eine Pflicht braeche jeden bestehenden Aufruf, und die Signatur
 * oben faengt den haeufigen Fall bereits. Wer sie mitgibt, bekommt Gewissheit statt
 * Plausibilitaet.
 */
export function pruefeZusage(
  bytes: Uint8Array,
  zusage: { groesse?: number | null; sha256?: string | null },
  bezeichnung: string,
): BytesFehler | null {
  if (typeof zusage.groesse === "number" && zusage.groesse !== bytes.byteLength) {
    return {
      grund:
        `"${bezeichnung}": zugesagt waren ${zusage.groesse} Bytes, angekommen sind ` +
        `${bytes.byteLength}.`,
      hinweis:
        zusage.groesse > bytes.byteLength
          ? "Die Uebertragung ist unterwegs abgeschnitten worden."
          : "Es sind mehr Bytes angekommen als angekuendigt.",
    };
  }

  const erwartet = zusage.sha256?.trim().toLowerCase();
  if (erwartet !== undefined && erwartet !== "") {
    if (!/^[0-9a-f]{64}$/.test(erwartet)) {
      return { grund: `"${bezeichnung}": sha256 ist keine 64-stellige Hexzahl.` };
    }
    const tatsaechlich = sha256Von(bytes);
    if (erwartet !== tatsaechlich) {
      return {
        grund: `"${bezeichnung}": sha256 stimmt nicht.`,
        hinweis: `Zugesagt ${erwartet}, angekommen ${tatsaechlich} ueber ${bytes.byteLength} Bytes.`,
      };
    }
  }

  return null;
}
