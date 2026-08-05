import { detectXmlVersion } from "../upgrade/v30ToV31.js";
import type { AasFormat, MetamodelVersion } from "./types.js";
import { ImportError } from "./types.js";

/**
 * Format- und Versionserkennung vor dem Deserialisieren (Plan Abschnitt 6).
 *
 * Erkannt wird am Inhalt, nicht an der Dateiendung. Die Endung dient nur als Hinweis,
 * wenn der Inhalt mehrdeutig ist.
 */

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04", AASX ist ein OPC- und ZIP-Container
const UTF8_BOM = [0xef, 0xbb, 0xbf];

export function detectFormat(bytes: Uint8Array, fileName?: string): AasFormat {
  if (startsWith(bytes, ZIP_MAGIC)) return "aasx";

  const first = firstMeaningfulChar(bytes);
  if (first === "<") return "xml";
  if (first === "{" || first === "[") return "json";

  const extension = fileName?.toLowerCase().split(".").pop();
  if (extension === "aasx" || extension === "xml" || extension === "json") return extension;

  throw new ImportError(
    "datei.formatUnbekannt",
    "Unknown format: expected JSON, XML or an AASX package.",
  );
}

/**
 * Version der Quelldatei.
 *
 * XML traegt sie im Namensraum. JSON traegt **keinen** Versionsmarker, siehe Zeile 8 der
 * Diff-Tabelle. Fuer JSON ist die Antwort deshalb ehrlich "unbekannt", und der Import
 * liest es direkt als 3.1, was laut Diff immer moeglich ist.
 */
export function detectVersion(format: AasFormat, text: string): MetamodelVersion {
  if (format === "xml") return detectXmlVersion(text);
  return "unbekannt";
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((value, index) => bytes[index] === value);
}

function firstMeaningfulChar(bytes: Uint8Array): string | null {
  let start = startsWith(bytes, UTF8_BOM) ? 3 : 0;
  while (start < bytes.length) {
    const byte = bytes[start] as number;
    // Leerraum ueberspringen: Leerzeichen, Tabulator, Zeilenumbruch, Wagenruecklauf
    if (byte !== 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
      return String.fromCharCode(byte);
    }
    start++;
  }
  return null;
}

export function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}
