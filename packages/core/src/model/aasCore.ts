import * as jsonization from "@aas-core-works/aas-core3.1-typescript/jsonization";
import type * as AasTypes from "@aas-core-works/aas-core3.1-typescript/types";

import { denormalize, normalize } from "./normalize.js";
import type { JsonObject } from "./json.js";
import type { EditorModel } from "./store.js";

/**
 * Bruecke zwischen den aas-core-Objekten und dem normalisierten Editor-Modell.
 *
 * Der Weg fuehrt bewusst ueber die jsonization der SDK statt ueber eigene Traversierung:
 * damit ist die Feldabdeckung immer vollstaendig, auch bei einem spaeteren Sprung auf 3.2,
 * und die Roundtrip-Treue haengt an der offiziellen Serialisierung, nicht an eigenem Code.
 *
 * Dieses Modul zieht `jsonization` (401 KB roh) herein und gehoert deshalb ausschliesslich
 * in den Worker, nie in den Hauptthread.
 */

export function fromAasCore(environment: AasTypes.Environment): EditorModel {
  return normalize(jsonization.toJsonable(environment) as JsonObject);
}

export function toAasCore(model: EditorModel): AasTypes.Environment {
  const jsonable = denormalize(model);
  // Der JsonValue der SDK kennt kein `null`, der des Editors schon: er muss auch
  // fremde Eingaben beschreiben koennen. An dieser einen Stelle treffen sich beide.
  const result = jsonization.environmentFromJsonable(jsonable as jsonization.JsonValue);
  // Deserialisierer werfen nicht, sie geben ein "either" zurueck (Plan Abschnitt 13).
  if (result.error !== null) {
    throw new Error(
      `Editor-Modell laesst sich nicht in ein Environment zurueckwandeln: ` +
        `${result.error.message} bei ${String(result.error.path)}`,
    );
  }
  return result.mustValue();
}

/** Kanonische JSON-Darstellung, Grundlage aller Vergleiche und Roundtrip-Tests. */
export function toCanonicalJson(environment: AasTypes.Environment): string {
  return JSON.stringify(jsonization.toJsonable(environment));
}
