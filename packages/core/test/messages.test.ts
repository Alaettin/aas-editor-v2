import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import * as types from "@aas-core-works/aas-core3.1-typescript/types";
import * as verification from "@aas-core-works/aas-core3.1-typescript/verification";

import { CONSTRAINT_TEXTS, explain } from "../src/validation/messages.js";

/**
 * Drift-Wache fuer die Uebersetzungen, gleiche Machart wie der Enum-Test.
 *
 * Statt eine Liste zu pflegen, wird der generierte Quelltext der SDK gelesen und jede
 * darin vorkommende Constraint-Kennung eingesammelt. Kommt mit einer neuen SDK ein
 * Constraint hinzu, faellt dieser Test, nicht die Oberflaeche.
 */

function constraintIdsOfSdk(): string[] {
  const require = createRequire(import.meta.url);
  const entry = require.resolve("@aas-core-works/aas-core3.1-typescript/verification");
  const source = readFileSync(entry, "utf8");

  const ids = new Set<string>();
  const pattern = /Constraint (AAS[dc]-[0-9A-Za-z-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) ids.add(match[1] as string);
  return [...ids].sort();
}

describe("Uebersetzung der Validierungsmeldungen", () => {
  const ids = constraintIdsOfSdk();

  it("findet die Constraints im Quelltext der SDK", () => {
    expect(ids.length).toBeGreaterThan(30);
    expect(ids).toContain("AASd-131");
  });

  it("uebersetzt jeden Constraint, den die SDK melden kann", () => {
    const fehlend = ids.filter((id) => !CONSTRAINT_TEXTS[id]);
    expect(fehlend, "ohne Uebersetzung").toEqual([]);
  });

  it("erfindet keine Uebersetzungen fuer Constraints, die es nicht gibt", () => {
    const ueberfluessig = Object.keys(CONSTRAINT_TEXTS).filter((id) => !ids.includes(id));
    expect(ueberfluessig).toEqual([]);
  });

  it("uebersetzt eine echte Meldung der SDK", () => {
    const assetInfo = new types.AssetInformation(types.AssetKind.Instance);
    const shell = new types.AssetAdministrationShell("https://example.com/aas/1", assetInfo);
    shell.idShort = "Pump";
    const env = new types.Environment();
    env.assetAdministrationShells = [shell];

    const errors = [...verification.verify(env)];
    expect(errors).toHaveLength(1);

    const result = explain(errors[0]!.message);
    expect(result.constraintId).toBe("AASd-131");
    expect(result.translated).toBe(true);
    expect(result.title).toContain("globalAssetId");
    expect(result.title).not.toContain("shall");
    // Die Rohmeldung bleibt erhalten, sie ist in der Oberflaeche aufklappbar.
    expect(result.raw).toBe(errors[0]!.message);
  });

  it("uebersetzt die Meldungen ohne Constraint-Kennung ueber Muster", () => {
    const faelle: ReadonlyArray<[string, RegExp]> = [
      [
        "ID-short of Referables shall only feature letters, digits, underscore.",
        /mindestens zwei Zeichen/,
      ],
      ["Description must be either not set or have at least one item.", /leer/],
      ["Display name must specify unique languages.", /dieselbe Sprache mehrfach/],
      ["Content type shall have a maximum length of 128 characters.", /hoechstens 128 Zeichen/],
      ["ID-shorts of the value must be unique.", /eindeutig/],
      ["All submodels must be model references to a submodel.", /ModelReference/],
    ];

    for (const [roh, erwartet] of faelle) {
      const result = explain(roh);
      expect(result.translated, roh).toBe(true);
      expect(result.title, roh).toMatch(erwartet);
      expect(result.constraintId, roh).toBeNull();
    }
  });

  it("laesst Unbekanntes unveraendert stehen, statt etwas zu erfinden", () => {
    const roh = "Something entirely unexpected happened here.";
    const result = explain(roh);
    expect(result.translated).toBe(false);
    expect(result.title).toBe(roh);
    expect(result.constraintId).toBeNull();
  });

  it("behaelt die Kennung, auch wenn eine Uebersetzung fehlen wuerde", () => {
    const result = explain("Constraint AASd-999: something new.");
    expect(result.constraintId).toBe("AASd-999");
    expect(result.translated).toBe(false);
    expect(result.title).toContain("AASd-999");
  });
});
