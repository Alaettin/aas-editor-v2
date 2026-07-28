import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import * as types from "@aas-core-works/aas-core3.1-typescript/types";

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

/**
 * Fuer die Untermasken ist die SDK die genauere Quelle als `maximal.json`.
 *
 * Grund: `DataSpecificationIec61360.valueList` fehlt in `maximal.json`, weil Constraint
 * AASc-3a-010 sie mit `value` unvereinbar macht und der Generator sich fuer `value`
 * entschieden hat. Eine Instanz der Klasse kennt dagegen alle Eigenschaften.
 */
function propertiesOfSdkClass(kind: string): string[] {
  const factories: Record<string, () => object> = {
    Qualifier: () => new types.Qualifier("t", types.DataTypeDefXsd.String),
    Extension: () => new types.Extension("n"),
    SpecificAssetId: () => new types.SpecificAssetId("n", "v"),
    AdministrativeInformation: () => new types.AdministrativeInformation(),
    AssetInformation: () => new types.AssetInformation(types.AssetKind.Instance),
    DataSpecificationIec61360: () => new types.DataSpecificationIec61360([]),
    ValueReferencePair: () => new types.ValueReferencePair("v", new types.Reference(
      types.ReferenceTypes.ExternalReference,
      [new types.Key(types.KeyTypes.GlobalReference, "x")],
    )),
  };

  const factory = factories[kind];
  if (!factory) throw new Error(`Kein Bauplan fuer ${kind}`);
  return Object.keys(factory());
}

describe("Untermasken der eingebetteten Objekte", () => {
  const nested = [
    "Qualifier",
    "Extension",
    "SpecificAssetId",
    "AdministrativeInformation",
    "AssetInformation",
    "DataSpecificationIec61360",
    "ValueReferencePair",
  ];

  it.each(nested)("%s: jede Eigenschaft der SDK-Klasse ist bearbeitbar", (kind) => {
    const properties = propertiesOfSdkClass(kind);
    expect(properties.length).toBeGreaterThan(0);

    const covered = new Set((NESTED_SPECS[kind] ?? []).map((field) => field.key));
    expect(properties.filter((key) => !covered.has(key)), `${kind}: nicht bearbeitbar`).toEqual([]);
  });

  it.each(nested)("%s: beschreibt keine Felder, die die SDK nicht kennt", (kind) => {
    const properties = new Set(propertiesOfSdkClass(kind));
    const erfunden = (NESTED_SPECS[kind] ?? [])
      .map((field) => field.key)
      .filter((key) => !properties.has(key));
    expect(erfunden).toEqual([]);
  });

  it("erfasst valueList, obwohl maximal.json sie nicht enthaelt", () => {
    // Die Falle, wegen der dieser Test nicht mehr gegen maximal.json prueft.
    expect(keysOfMaximal("DataSpecificationIec61360")).not.toContain("valueList");
    expect(propertiesOfSdkClass("DataSpecificationIec61360")).toContain("valueList");
    expect(
      (NESTED_SPECS["DataSpecificationIec61360"] ?? []).map((f) => f.key),
    ).toContain("valueList");
  });
});
