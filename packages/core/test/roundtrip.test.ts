import { describe, expect, it } from "vitest";
import * as jsonization from "@aas-core-works/aas-core3.1-typescript/jsonization";

import { fromAasCore, toAasCore, toCanonicalJson } from "../src/model/aasCore.js";
import { countNodes } from "../src/model/store.js";
import { hasTestData, loadCorpus } from "./corpus.js";

/**
 * Abnahme Phase 1: `toAasCore(fromAasCore(env))` ist fuer die offiziellen Testdaten
 * inhaltsgleich mit `env`.
 */

const corpus = hasTestData() ? loadCorpus("3.1") : [];

describe("Roundtrip Modell", () => {
  it("findet die offiziellen Testdaten", () => {
    expect(hasTestData(), "Testdaten fehlen, 'pnpm test-data' ausfuehren").toBe(true);
    expect(corpus.length).toBeGreaterThan(500);
  });

  it("wandelt jede Testdatei verlustfrei hin und zurueck", () => {
    const failures: string[] = [];

    for (const entry of corpus) {
      const parsed = jsonization.environmentFromJsonable(entry.environment);
      if (parsed.error !== null) {
        failures.push(`${entry.name}: Testdatei nicht lesbar, ${parsed.error.message}`);
        continue;
      }

      const original = parsed.mustValue();
      const before = toCanonicalJson(original);

      try {
        const after = toCanonicalJson(toAasCore(fromAasCore(original)));
        if (after !== before) failures.push(`${entry.name}: Inhalt weicht ab`);
      } catch (error) {
        failures.push(`${entry.name}: ${(error as Error).message}`);
      }
    }

    expect(failures.slice(0, 20).join("\n")).toBe("");
    expect(failures).toHaveLength(0);
  });

  it("wandelt auch die 3.0-Testdaten nach dem Upgrade verlustfrei", () => {
    const corpus30 = loadCorpus("3.0");
    expect(corpus30.length).toBeGreaterThan(2000);

    const failures: string[] = [];
    for (const entry of corpus30) {
      const parsed = jsonization.environmentFromJsonable(entry.environment);
      if (parsed.error !== null) continue;

      const original = parsed.mustValue();
      const before = toCanonicalJson(original);
      try {
        const after = toCanonicalJson(toAasCore(fromAasCore(original)));
        if (after !== before) failures.push(`${entry.name}: Inhalt weicht ab`);
      } catch (error) {
        failures.push(`${entry.name}: ${(error as Error).message}`);
      }
    }

    expect(failures.slice(0, 20).join("\n")).toBe("");
  });

  it("legt fuer jedes Element genau einen Knoten an", () => {
    const parsed = jsonization.environmentFromJsonable(
      corpus.find((e) => e.name === "Environment/maximal.json")?.environment ?? {},
    );
    expect(parsed.error).toBeNull();
    const env = parsed.mustValue();

    const model = fromAasCore(env);

    // descend() liefert alle Nachfahren, darunter auch Nicht-Knoten wie Reference
    // oder Qualifier. Der Baum darf davon nur die Struktur-Elemente enthalten.
    let structural = 1; // Environment selbst
    for (const item of env.descend()) {
      const kind = item.constructor.name;
      if (
        kind === "AssetAdministrationShell" ||
        kind === "Submodel" ||
        kind === "ConceptDescription" ||
        kind === "Property" ||
        kind === "MultiLanguageProperty" ||
        kind === "Range" ||
        kind === "Blob" ||
        kind === "File" ||
        kind === "ReferenceElement" ||
        kind === "RelationshipElement" ||
        kind === "AnnotatedRelationshipElement" ||
        kind === "Capability" ||
        kind === "Operation" ||
        kind === "BasicEventElement" ||
        kind === "Entity" ||
        kind === "SubmodelElementList" ||
        kind === "SubmodelElementCollection"
      ) {
        structural++;
      }
    }

    expect(countNodes(model)).toBe(structural);
  });
});
