import { IDENTIFIABLE_KINDS, SUBMODEL_ELEMENT_KINDS } from "@aas-editor/core";
import { describe, expect, it } from "vitest";

import { badgeToneOf, shortKind, toneOf } from "../src/lib/typeOf";

/**
 * Der Farbcode gilt in Baum, Tabelle, Formular, Graph und Legende. Ein Typ ohne Ton waere
 * ein graues Loch, das in jeder Sicht anders auffaellt.
 */
describe("Farbton je Typ", () => {
  const bekannt = ["neutral", "aas", "sm", "cd", "warn", "danger"];

  it.each([...IDENTIFIABLE_KINDS, ...SUBMODEL_ELEMENT_KINDS])("%s hat einen Ton", (kind) => {
    expect(bekannt).toContain(toneOf(kind));
    expect(bekannt).toContain(badgeToneOf(kind));
  });

  it("faerbt die drei Identifiables verschieden", () => {
    expect(toneOf("AssetAdministrationShell")).toBe("aas");
    expect(toneOf("Submodel")).toBe("sm");
    expect(toneOf("ConceptDescription")).toBe("cd");
  });

  it("hebt mehrsprachige Werte nur im Tabellen-Badge hervor", () => {
    expect(badgeToneOf("MultiLanguageProperty")).toBe("aas");
    expect(toneOf("MultiLanguageProperty")).toBe("neutral");
  });

  it("kuerzt lange Typnamen, laesst kurze stehen", () => {
    expect(shortKind("SubmodelElementCollection")).toBe("SMC");
    expect(shortKind("Property")).toBe("Property");
  });
});
