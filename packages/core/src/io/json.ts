import * as jsonization from "@aas-core-works/aas-core3.1-typescript/jsonization";
import type * as AasTypes from "@aas-core-works/aas-core3.1-typescript/types";

import { ImportError } from "./types.js";

/**
 * JSON-Import und -Export.
 *
 * Laut Zeile 1 bis 3 und 8 der Diff-Tabelle ist ein 3.0-JSON strukturell ein gueltiges
 * 3.1-JSON und es gibt keinen Versionsmarker. Es wird deshalb direkt als 3.1 gelesen.
 * Nur wenn das fehlschlaegt, wird die 3.0-SDK dynamisch nachgeladen, allein um eine
 * praezisere Fehlermeldung zu bekommen. Im Regelfall spart das die rund 100 KB gzip
 * der zweiten SDK vollstaendig ein (Plan Abschnitt 10).
 */

export async function importJson(text: string): Promise<AasTypes.Environment> {
  let jsonable: jsonization.JsonValue;
  try {
    jsonable = JSON.parse(text) as jsonization.JsonValue;
  } catch (error) {
    throw new ImportError(`Datei ist kein gueltiges JSON: ${(error as Error).message}`);
  }

  const result = jsonization.environmentFromJsonable(jsonable);
  // Deserialisierer werfen nicht, sie geben ein "either" zurueck (Plan Abschnitt 13).
  if (result.error === null) return result.mustValue();

  const detail = await describeWith30(jsonable, result.error.message);
  throw new ImportError(detail, String(result.error.path));
}

export function exportJson(environment: AasTypes.Environment, pretty = false): string {
  const jsonable = jsonization.toJsonable(environment);
  return pretty ? JSON.stringify(jsonable, null, 2) : JSON.stringify(jsonable);
}

/**
 * Zweite Meinung der 3.0-SDK. Liest sie die Datei, liegt es nicht am Inhalt, sondern an
 * einer Abweichung zwischen den Fassungen, und das gehoert in die Meldung.
 */
async function describeWith30(
  jsonable: jsonization.JsonValue,
  message: string,
): Promise<string> {
  try {
    const jsonization30 = await import("@aas-core-works/aas-core3.0-typescript/jsonization");
    const as30 = jsonization30.environmentFromJsonable(jsonable);
    if (as30.error === null) {
      return (
        `Die Datei ist als Metamodell 3.0 lesbar, als 3.1 aber nicht: ${message}. ` +
        `Das deutet auf eine Abweichung hin, die der Upgrade-Mapper noch nicht kennt. ` +
        `Bitte in docs/metamodell-diff-3.0-3.1.md ergaenzen.`
      );
    }
  } catch {
    // Die 3.0-SDK ist nur fuer die bessere Meldung da. Faellt sie aus, bleibt die 3.1-Meldung.
  }
  return message;
}
