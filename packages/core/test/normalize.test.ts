import { describe, expect, it } from "vitest";

import type { JsonObject } from "../src/model/json.js";
import { denormalize, normalize } from "../src/model/normalize.js";
import { hasTestData, loadCorpus } from "./corpus.js";

/**
 * Die Aussage, auf der das Serverprotokoll steht: der Klient normalisiert vor dem Laden
 * und denormalisiert vor dem Speichern, der Server sieht nur AAS-JSON. Faellt dieser Test,
 * verliert jedes Speichern Daten, ohne dass irgendwo ein Fehler erscheint.
 *
 * Verglichen wird kanonisierter Text, weil die Schluesselreihenfolge im JSON-Objekt nicht
 * Teil der Zusage ist. Reihenfolge innerhalb einer Liste ist es sehr wohl.
 */

function kanonisch(value: unknown): string {
  const sortiere = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sortiere);
    if (typeof input !== "object" || input === null) return input;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(input as Record<string, unknown>).sort()) {
      out[key] = sortiere((input as Record<string, unknown>)[key]);
    }
    return out;
  };
  return JSON.stringify(sortiere(value));
}

describe("normalize und denormalize", () => {
  it.skipIf(!hasTestData())("gibt jede offizielle Umgebung unveraendert zurueck", () => {
    const corpus = loadCorpus("3.1");
    const abweichungen: string[] = [];

    for (const entry of corpus) {
      // Die Testdaten sind als SDK-JsonObject typisiert, inhaltlich ist es dasselbe JSON.
      const zurueck = denormalize(normalize(entry.environment as unknown as JsonObject));
      if (kanonisch(zurueck) !== kanonisch(entry.environment)) abweichungen.push(entry.name);
    }

    expect(abweichungen.slice(0, 5)).toEqual([]);
  });

  it("behaelt leere Slots als leere Listen", () => {
    const environment = { assetAdministrationShells: [], submodels: [], conceptDescriptions: [] };
    expect(denormalize(normalize(environment))).toEqual(environment);
  });

  it("laesst einen fehlenden Slot fehlend", () => {
    // denormalize schreibt nur Slots, die es beim Normalisieren gab. Der Server ergaenzt
    // die drei Listen deshalb bewusst immer, das ist sein Fixpunkt, nicht der des Kerns.
    expect(denormalize(normalize({ submodels: [] }))).toEqual({ submodels: [] });
  });

  it("rettet ein unbekanntes Feld der Wurzel", () => {
    const environment = { spaeteresFeld: { a: 1 }, submodels: [] };
    expect(denormalize(normalize(environment))).toEqual(environment);
  });
});
