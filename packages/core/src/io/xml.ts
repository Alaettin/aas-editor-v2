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

export interface XmlImportResult {
  readonly environment: AasTypes.Environment;
  readonly upgradeNotes: readonly UpgradeNote[];
}

export async function importXml(text: string): Promise<XmlImportResult> {
  const upgraded = upgradeXml(text);
  const xmlization = await loadXmlization();

  const result = xmlization.fromXmlString(upgraded.value);
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
