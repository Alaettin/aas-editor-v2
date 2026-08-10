import * as AasTypes from "@aas-core-works/aas-core3.1-typescript/types";

import { upgradeXml, type UpgradeNote } from "../upgrade/v30ToV31.js";
import { ImportError } from "./types.js";

/**
 * XML-Import und -Export.
 *
 * `xmlization` ist mit 475 KB roh das groesste Modul der SDK und wird deshalb
 * ausschliesslich dynamisch geladen, erst wenn XML oder AASX tatsaechlich benutzt wird
 * (Plan Abschnitt 10).
 *
 * Ein 3.0-Dokument wird ueber den Namensraum-Tausch gehoben. Die 3.0-SDK kann hier nicht
 * helfen: sie bringt gar kein xmlization mit, siehe docs/metamodell-diff-3.0-3.1.md.
 */

async function loadXmlization() {
  return import("@aas-core-works/aas-core3.1-typescript/xmlization");
}

/**
 * Schneidet den XML-Prolog ab: BOM, Leerraum, Processing Instructions, Kommentare und
 * eine DOCTYPE-Deklaration.
 *
 * **Der Leser der SDK vertraegt keine XML-Deklaration.** `<?xml version="1.0"?>` ist eine
 * Processing Instruction, und `fromXmlString` erwartet als erstes Token ein Startelement:
 * "Expected a root XML start element, but got token kind: processing-instruction".
 * Kommentare uebergeht er, Processing Instructions nicht.
 *
 * Warum das lange niemandem auffiel: **wir selbst schreiben keine Deklaration.**
 * `toXmlString` beginnt direkt mit `<environment …>`, und die offiziellen Testdaten tun
 * es auch. Jeder eigene Rundlauf laeuft deshalb durch, waehrend eine Datei aus einem
 * fremden Werkzeug scheitert, und die schreiben die Deklaration praktisch immer.
 *
 * Geschnitten wird ausschliesslich der **Prolog**, also alles vor dem Wurzelelement. Eine
 * Processing Instruction mitten im Inhalt ist etwas anderes als eine davor, und ein
 * Suchen und Ersetzen ueber den ganzen Text traefe irgendwann Zeichen in Werten.
 */
export function ohneProlog(xml: string): string {
  let rest = xml.startsWith("\uFEFF") ? xml.slice(1) : xml;

  for (;;) {
    const getrimmt = rest.replace(/^\s+/, "");

    if (getrimmt.startsWith("<?")) {
      const ende = getrimmt.indexOf("?>");
      // Ein unabgeschlossener Prolog ist kaputtes XML. Dann bleibt der Text, wie er ist,
      // und die Fehlermeldung kommt von der SDK: sie sagt genauer, was fehlt.
      if (ende < 0) return rest;
      rest = getrimmt.slice(ende + 2);
      continue;
    }

    if (getrimmt.startsWith("<!--")) {
      const ende = getrimmt.indexOf("-->");
      if (ende < 0) return rest;
      rest = getrimmt.slice(ende + 3);
      continue;
    }

    if (getrimmt.startsWith("<!DOCTYPE")) {
      const ende = getrimmt.indexOf(">");
      if (ende < 0) return rest;
      rest = getrimmt.slice(ende + 1);
      continue;
    }

    return getrimmt;
  }
}

export interface XmlImportResult {
  readonly environment: AasTypes.Environment;
  readonly upgradeNotes: readonly UpgradeNote[];
}

export async function importXml(text: string): Promise<XmlImportResult> {
  // Erst der Namensraumtausch auf dem Rohtext, dann der Schnitt: `upgradeXml` sucht den
  // 3.0-Namensraum, und der steht im Wurzelelement, nicht im Prolog.
  const upgraded = upgradeXml(text);
  const xmlization = await loadXmlization();

  const result = xmlization.fromXmlString(ohneProlog(upgraded.value));
  if (result.error !== null) {
    throw new ImportError(
      "datei.xmlUnlesbar",
      `XML not readable: ${result.error.message}`,
      { grund: result.error.message },
      String(result.error.path ?? ""),
    );
  }

  // fromXmlString liefert `Class`, nicht zwingend eine Environment. Ein XML, das etwa
  // nur ein Submodel enthaelt, ist gueltig, aber fuer den Editor kein Ausgangspunkt.
  const value = result.mustValue();
  if (!(value instanceof AasTypes.Environment)) {
    throw new ImportError(
      "datei.xmlKeineUmgebung",
      `XML contains ${value.constructor.name} instead of an Environment.`,
      { gefunden: value.constructor.name },
    );
  }

  return { environment: value, upgradeNotes: upgraded.notes };
}

export async function exportXml(environment: AasTypes.Environment): Promise<string> {
  const xmlization = await loadXmlization();
  return xmlization.toXmlString(environment);
}
