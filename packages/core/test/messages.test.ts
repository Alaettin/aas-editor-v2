import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import * as types from "@aas-core-works/aas-core3.1-typescript/types";
import * as verification from "@aas-core-works/aas-core3.1-typescript/verification";

import { ALLE_BEFUND_SCHLUESSEL, CONSTRAINT_IDS, explain } from "../src/validation/messages.js";

/**
 * Drift-Wache fuer die Uebersetzungen, gleiche Machart wie der Enum-Test.
 *
 * Statt eine Liste zu pflegen, wird der generierte Quelltext der SDK gelesen und jede
 * darin vorkommende Constraint-Kennung eingesammelt. Kommt mit einer neuen SDK ein
 * Constraint hinzu, faellt dieser Test, nicht die Oberflaeche.
 *
 * Geprueft wird hier **SDK gegen Kern**, also ob es zu jeder Kennung einen Schluessel
 * gibt. Ob hinter dem Schluessel auch ein Satz steht, prueft `apps/web/test/i18n.test.ts`
 * fuer jede Sprache einzeln. Der Kern kennt keine Sprache und soll auch keine kennen.
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

  it("kennt jeden Constraint, den die SDK melden kann", () => {
    const fehlend = ids.filter((id) => !CONSTRAINT_IDS.includes(id));
    expect(fehlend, "ohne Schluessel").toEqual([]);
  });

  it("fuehrt keine Constraints, die es nicht gibt", () => {
    const ueberfluessig = CONSTRAINT_IDS.filter((id) => !ids.includes(id));
    expect(ueberfluessig).toEqual([]);
  });

  it("nennt jeden Schluessel, den er liefern kann, in einer Liste", () => {
    // Die Sprachdateien werden gegen diese Liste geprueft. Faellt ein Schluessel aus ihr
    // heraus, gaebe es einen Befund ohne Satz, und niemand merkte es.
    for (const id of CONSTRAINT_IDS) {
      expect(ALLE_BEFUND_SCHLUESSEL).toContain(`befund.regel.${id}`);
    }
    expect(ALLE_BEFUND_SCHLUESSEL.length).toBe(CONSTRAINT_IDS.length + 8);
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
    expect(result.schluessel).toBe("befund.regel.AASd-131");
    // Die Rohmeldung bleibt erhalten, sie ist in der Oberflaeche aufklappbar.
    expect(result.raw).toBe(errors[0]!.message);
  });

  it("ordnet die Meldungen ohne Constraint-Kennung einem Muster zu", () => {
    const faelle: ReadonlyArray<[string, string, Record<string, string>]> = [
      [
        "ID-short of Referables shall only feature letters, digits, underscore.",
        "befund.muster.idShortMuster",
        {},
      ],
      [
        "Description must be either not set or have at least one item.",
        "befund.muster.leereListe",
        { feld: "Description" },
      ],
      [
        "Display name must specify unique languages.",
        "befund.muster.spracheMehrfach",
        { feld: "Display name" },
      ],
      [
        "Content type shall have a maximum length of 128 characters.",
        "befund.muster.zuLang",
        { feld: "Content type", laenge: "128" },
      ],
      ["ID-shorts of the value must be unique.", "befund.muster.idShortsUneindeutig", {}],
      [
        "All submodels must be model references to a submodel.",
        "befund.muster.submodelsModelReference",
        {},
      ],
    ];

    for (const [roh, schluessel, werte] of faelle) {
      const result = explain(roh);
      expect(result.schluessel, roh).toBe(schluessel);
      // Der Feldname der SDK wird als Wert weitergereicht, nicht in einen Satz geklebt:
      // sonst koennte keine Uebersetzung ihn verschieben.
      expect(result.werte, roh).toEqual(werte);
      expect(result.constraintId, roh).toBeNull();
      expect(ALLE_BEFUND_SCHLUESSEL, roh).toContain(schluessel);
    }
  });

  it("laesst Unbekanntes ohne Schluessel, statt etwas zu erfinden", () => {
    const roh = "Something entirely unexpected happened here.";
    const result = explain(roh);
    expect(result.schluessel).toBeNull();
    expect(result.raw).toBe(roh);
    expect(result.constraintId).toBeNull();
  });

  it("behaelt die Kennung, auch wenn ein Schluessel fehlen wuerde", () => {
    const result = explain("Constraint AASd-999: something new.");
    expect(result.constraintId).toBe("AASd-999");
    expect(result.schluessel).toBeNull();
    expect(result.raw).toContain("AASd-999");
  });
});
