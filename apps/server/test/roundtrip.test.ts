import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { joinEnvironment, splitEnvironment } from "../src/services/environment.js";
import { kanonisch } from "./helpers/fixture.js";

/**
 * Die Zerlegung in Identifiable-Zeilen darf nichts verlieren. Geprueft wird direkt gegen
 * den Dienst, nicht ueber HTTP: hier geht es um die Zerlegung, nicht um die Route.
 *
 * Was garantiert ist: Feldinhalte, Reihenfolge je Liste, Wurzelfelder. Nicht garantiert
 * und auch nicht noetig: die Schluesselreihenfolge im JSON-Objekt, deshalb der Vergleich
 * ueber kanonisierten Text.
 */

const ENVIRONMENTS = fileURLToPath(
  new URL("../../../test-data/aas-core3.1/test_data/Json/Expected/Environment", import.meta.url),
);

function rundlauf(environment: Record<string, unknown>): unknown {
  const split = splitEnvironment(environment);
  return joinEnvironment(split.environmentData, {
    assetAdministrationShells: split.rows.assetAdministrationShells,
    submodels: split.rows.submodels,
    conceptDescriptions: split.rows.conceptDescriptions,
  });
}

/**
 * Ein leerer Slot kommt nicht zurueck, und das ist richtig: das Metamodell verlangt fuer
 * alle drei "either not set or have at least one item", ein `"submodels": []` ist selbst
 * ein Constraint-Verstoss. Steht er in der Quelle, ist sein Verschwinden kein Verlust.
 */
function ohneLeereSlots(environment: Record<string, unknown>): Record<string, unknown> {
  const out = { ...environment };
  for (const slot of ["assetAdministrationShells", "submodels", "conceptDescriptions"]) {
    if (Array.isArray(out[slot]) && out[slot].length === 0) delete out[slot];
  }
  return out;
}

describe("Rundlauf Environment zu Zeilen und zurueck", () => {
  const vorhanden = existsSync(ENVIRONMENTS);

  it.skipIf(!vorhanden)("haelt die offiziellen 3.1-Testdaten unveraendert", () => {
    const dateien = readdirSync(ENVIRONMENTS).filter((name) => name.endsWith(".json"));
    expect(dateien.length).toBeGreaterThan(0);

    for (const datei of dateien) {
      const roh = JSON.parse(readFileSync(join(ENVIRONMENTS, datei), "utf8")) as Record<
        string,
        unknown
      >;
      expect(kanonisch(rundlauf(roh)), datei).toBe(kanonisch(ohneLeereSlots(roh)));
    }
  });

  it("behaelt die Reihenfolge innerhalb einer Liste", () => {
    const environment = {
      submodels: [
        { modelType: "Submodel", id: "c", idShort: "Dritter" },
        { modelType: "Submodel", id: "a", idShort: "Erster" },
        { modelType: "Submodel", id: "b", idShort: "Zweiter" },
      ],
    };
    const zurueck = rundlauf(environment) as { submodels: { id: string }[] };
    expect(zurueck.submodels.map((s) => s.id)).toEqual(["c", "a", "b"]);
  });

  it("rettet ein unbekanntes Wurzelfeld", () => {
    const zurueck = rundlauf({ spaeteresFeld: 42 }) as Record<string, unknown>;
    expect(zurueck["spaeteresFeld"]).toBe(42);
  });
});
