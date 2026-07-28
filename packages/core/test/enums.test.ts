import { describe, expect, it } from "vitest";
import * as types from "@aas-core-works/aas-core3.1-typescript/types";
import * as stringification from "@aas-core-works/aas-core3.1-typescript/stringification";

import { ENUMS, type EnumName } from "../src/schema/enums.js";

/**
 * Drift-Wache. Die Auswahllisten des Formulars stehen als Zeichenketten in
 * `src/schema/enums.ts`, damit die 324 KB der SDK-`types` nicht in den Hauptthread
 * geraten. Dieser Test haelt sie gegen die SDK: Inhalt und Reihenfolge muessen exakt
 * stimmen. Aendert sich das Metamodell, faellt der Test, nicht die Oberflaeche.
 */

const TO_STRING: Record<EnumName, (value: number) => string | null> = {
  AssetKind: stringification.assetKindToString,
  ModellingKind: stringification.modellingKindToString,
  QualifierKind: stringification.qualifierKindToString,
  EntityType: stringification.entityTypeToString,
  Direction: stringification.directionToString,
  StateOfEvent: stringification.stateOfEventToString,
  AasSubmodelElements: stringification.aasSubmodelElementsToString,
  ReferenceTypes: stringification.referenceTypesToString,
  KeyTypes: stringification.keyTypesToString,
  DataTypeDefXsd: stringification.dataTypeDefXsdToString,
  DataTypeIec61360: stringification.dataTypeIec61360ToString,
};

/** Numerische TS-Enums tragen eine Rueckwaerts-Abbildung, die hier stoert. */
function membersOf(enumeration: Record<string, unknown>): number[] {
  return Object.values(enumeration).filter((value): value is number => typeof value === "number");
}

describe("Aufzaehlungswerte stimmen mit der SDK ueberein", () => {
  const cases = Object.keys(ENUMS) as EnumName[];

  it.each(cases)("%s", (name) => {
    const enumeration = (types as unknown as Record<string, Record<string, unknown>>)[name];
    expect(enumeration, `Die SDK kennt ${name} nicht mehr.`).toBeDefined();

    const fromSdk = membersOf(enumeration!).map((value) => {
      const text = TO_STRING[name](value);
      expect(text, `${name}: Wert ${value} laesst sich nicht in Text wandeln.`).not.toBeNull();
      return text as string;
    });

    expect([...ENUMS[name]]).toEqual(fromSdk);
  });

  it("deckt jede Aufzaehlung ab, die im Formular vorkommt", () => {
    // Sicherheitsnetz gegen ein vergessenes Enum: die SDK kennt weitere Aufzaehlungen,
    // aber jede, die hier gefuehrt wird, muss auch dort existieren.
    for (const name of cases) {
      expect(Object.keys(types)).toContain(name);
    }
  });
});
