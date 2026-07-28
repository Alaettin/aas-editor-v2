import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { childSlotsOf, SUBMODEL_ELEMENT_KINDS } from "../src/model/kinds.js";
import { ELEMENT_SPECS, NESTED_SPECS, specOf } from "../src/schema/elements.js";
import { fieldsOf } from "../src/schema/fields.js";
import { ENUMS } from "../src/schema/enums.js";
import { testDataRoot } from "./corpus.js";

/**
 * Abdeckungs-Wache fuer die Abnahme von Phase 3: "jeder der 14 Elementtypen laesst sich
 * anlegen und **vollstaendig ausfuellen**".
 *
 * Bewiesen statt behauptet: fuer jede `maximal.json` der offiziellen Testdaten werden die
 * JSON-Schluessel gegen den Deskriptor gehalten. Jeder Schluessel muss entweder ein Feld
 * der Maske oder ein Kind-Slot des Baums sein. Fehlt eines, faellt der Test.
 */

const EXPECTED = join(testDataRoot, "aas-core3.1/test_data/Json/Expected");

function keysOfMaximal(kind: string): string[] {
  const file = join(EXPECTED, kind, "maximal.json");
  if (!existsSync(file)) return [];
  const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  return Object.keys(raw).filter((key) => key !== "modelType");
}

const EDITABLE_KINDS = [
  ...SUBMODEL_ELEMENT_KINDS,
  "AssetAdministrationShell",
  "Submodel",
  "ConceptDescription",
];

describe("Typbeschreibungen", () => {
  it("kennt jeden der 14 SubmodelElement-Typen und die drei Identifiables", () => {
    for (const kind of EDITABLE_KINDS) {
      expect(specOf(kind), `Kein Deskriptor fuer ${kind}`).toBeDefined();
    }
    expect(SUBMODEL_ELEMENT_KINDS).toHaveLength(14);
  });

  it.each(EDITABLE_KINDS)("%s: jedes Feld der Testdaten ist erreichbar", (kind) => {
    const keys = keysOfMaximal(kind);
    expect(keys.length, `maximal.json fuer ${kind} fehlt, 'pnpm test-data' ausfuehren`).
      toBeGreaterThan(0);

    const spec = specOf(kind)!;
    const covered = new Set([
      ...fieldsOf(spec).map((field) => field.key),
      ...childSlotsOf(kind).map((slot) => slot.name),
    ]);

    const missing = keys.filter((key) => !covered.has(key));
    expect(missing, `${kind}: nicht bearbeitbar`).toEqual([]);
  });

  it("beschreibt keine Felder, die es im Metamodell nicht gibt", () => {
    const wrong: string[] = [];
    for (const kind of EDITABLE_KINDS) {
      const keys = new Set(keysOfMaximal(kind));
      for (const field of fieldsOf(specOf(kind)!)) {
        if (!keys.has(field.key)) wrong.push(`${kind}.${field.key}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("fuehrt Kind-Slots nicht zusaetzlich als Formularfeld", () => {
    // Kinder gehoeren in den Baum, nicht in die Maske. Sonst gaebe es zwei Wege,
    // dieselbe Struktur zu aendern, und einer davon umgeht die Kollisionspruefung.
    for (const [kind, spec] of Object.entries(ELEMENT_SPECS)) {
      const slots = new Set(childSlotsOf(kind).map((slot) => slot.name));
      for (const field of fieldsOf(spec)) {
        expect(slots.has(field.key), `${kind}.${field.key} ist Slot und Feld zugleich`).toBe(false);
      }
    }
  });

  it("verweist nur auf bekannte Aufzaehlungen und gueltige typedBy-Felder", () => {
    for (const [kind, spec] of Object.entries(ELEMENT_SPECS)) {
      const keys = new Set(fieldsOf(spec).map((field) => field.key));
      for (const field of fieldsOf(spec)) {
        if (field.kind === "enum") {
          expect(field.enum, `${kind}.${field.key} ist enum ohne Aufzaehlung`).toBeDefined();
          expect(Object.keys(ENUMS)).toContain(field.enum);
        }
        if (field.typedBy) {
          expect(keys, `${kind}.${field.key}: typedBy zeigt ins Leere`).toContain(field.typedBy);
        }
      }
    }
  });
});

describe("Untermasken der eingebetteten Objekte", () => {
  const nested = ["Qualifier", "Extension", "SpecificAssetId", "AdministrativeInformation"];

  it.each(nested)("%s: jedes Feld der Testdaten ist erreichbar", (kind) => {
    const keys = keysOfMaximal(kind);
    expect(keys.length).toBeGreaterThan(0);

    const covered = new Set((NESTED_SPECS[kind] ?? []).map((field) => field.key));
    expect(keys.filter((key) => !covered.has(key))).toEqual([]);
  });

  it("AssetInformation ist vollstaendig", () => {
    const keys = keysOfMaximal("AssetInformation");
    const covered = new Set((NESTED_SPECS["AssetInformation"] ?? []).map((f) => f.key));
    expect(keys.filter((key) => !covered.has(key))).toEqual([]);
  });
});
