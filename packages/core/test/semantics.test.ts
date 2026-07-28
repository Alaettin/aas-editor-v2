import { describe, expect, it } from "vitest";

import { normalize } from "../src/model/normalize.js";
import { walk } from "../src/model/store.js";
import {
  describeSemanticId,
  iec61360Of,
  pickLangString,
  resolveSemanticId,
  valueChoices,
} from "../src/semantics.js";

/**
 * Abnahme Phase 5: "eine semanticId mit passender ConceptDescription zeigt deren
 * Klarnamen, und bei vorhandener valueList wird der Wert zur Auswahl mit automatisch
 * gesetzter valueId."
 *
 * Wichtig ist die Gegenprobe: fehlt ein Glied der Kette, ist das **kein Fehler**.
 */

const CD_ID = "https://example.com/cd/temperatur";

function referenceAuf(id: string) {
  return { type: "ExternalReference", keys: [{ type: "GlobalReference", value: id }] };
}

function umgebung(spec: Record<string, unknown> | null) {
  return normalize({
    submodels: [
      {
        id: "https://example.com/sm/1",
        idShort: "TechnicalData",
        modelType: "Submodel",
        submodelElements: [
          {
            idShort: "Temperatur",
            valueType: "xs:string",
            semanticId: referenceAuf(CD_ID),
            modelType: "Property",
          },
        ],
      },
    ],
    conceptDescriptions: [
      {
        id: CD_ID,
        idShort: "Temperatur",
        modelType: "ConceptDescription",
        ...(spec
          ? {
              embeddedDataSpecifications: [
                {
                  dataSpecification: referenceAuf("https://admin-shell.io/DataSpecificationTemplates"),
                  dataSpecificationContent: { modelType: "DataSpecificationIec61360", ...spec },
                },
              ],
            }
          : {}),
      },
    ],
  });
}

const VOLLSTAENDIG = {
  preferredName: [
    { language: "de", text: "Betriebstemperatur" },
    { language: "en", text: "Operating temperature" },
  ],
  definition: [{ language: "de", text: "Temperatur im Dauerbetrieb" }],
  unit: "°C",
  dataType: "REAL_MEASURE",
  valueList: {
    valueReferencePairs: [
      { value: "kalt", valueId: referenceAuf("https://example.com/value/kalt") },
      { value: "warm", valueId: referenceAuf("https://example.com/value/warm") },
    ],
  },
};

describe("semanticId aufloesen", () => {
  it("findet die ConceptDescription in derselben Umgebung", () => {
    const model = umgebung(VOLLSTAENDIG);
    const property = [...walk(model)].find((n) => n.kind === "Property")!;

    const cd = resolveSemanticId(model, property.data["semanticId"]);
    expect(cd).not.toBeNull();
    expect(cd!.kind).toBe("ConceptDescription");
    expect(cd!.data["id"]).toBe(CD_ID);
  });

  it("liefert null, wenn die ConceptDescription nicht in der Umgebung liegt", () => {
    const model = umgebung(VOLLSTAENDIG);
    expect(resolveSemanticId(model, referenceAuf("https://example.com/cd/fremd"))).toBeNull();
  });

  it("liefert null bei fehlender oder leerer Reference", () => {
    const model = umgebung(VOLLSTAENDIG);
    expect(resolveSemanticId(model, undefined)).toBeNull();
    expect(resolveSemanticId(model, { type: "ExternalReference", keys: [] })).toBeNull();
  });
});

describe("Klarnamen und Wertelisten", () => {
  it("zeigt Klarname, Definition und Einheit, bevorzugt auf Deutsch", () => {
    const model = umgebung(VOLLSTAENDIG);
    const property = [...walk(model)].find((n) => n.kind === "Property")!;

    const info = describeSemanticId(model, property.data["semanticId"])!;
    expect(info.preferredName).toBe("Betriebstemperatur");
    expect(info.definition).toBe("Temperatur im Dauerbetrieb");
    expect(info.unit).toBe("°C");
    expect(info.dataType).toBe("REAL_MEASURE");
  });

  it("liefert die Wertepaare samt valueId", () => {
    const model = umgebung(VOLLSTAENDIG);
    const property = [...walk(model)].find((n) => n.kind === "Property")!;

    const info = describeSemanticId(model, property.data["semanticId"])!;
    expect(info.choices).toHaveLength(2);
    expect(info.choices[0]!.value).toBe("kalt");
    expect(info.choices[0]!.valueId).not.toBeNull();
    expect(JSON.stringify(info.choices[1]!.valueId)).toContain("value/warm");
  });

  it("faellt auf Englisch zurueck, wenn Deutsch fehlt", () => {
    const model = umgebung({
      preferredName: [{ language: "en", text: "Operating temperature" }],
    });
    const property = [...walk(model)].find((n) => n.kind === "Property")!;
    expect(describeSemanticId(model, property.data["semanticId"])!.preferredName).toBe(
      "Operating temperature",
    );
  });

  it("nimmt irgendeine Sprache, wenn weder Deutsch noch Englisch da ist", () => {
    expect(pickLangString([{ language: "fr", text: "Température" }], ["de", "en"])).toBe(
      "Température",
    );
  });

  it("versteht Sprachvarianten wie de-DE als Deutsch", () => {
    expect(pickLangString([{ language: "de-DE", text: "Wert" }], ["de"])).toBe("Wert");
  });
});

describe("Fehlende Glieder sind kein Fehler", () => {
  it("ConceptDescription ohne embeddedDataSpecifications", () => {
    const model = umgebung(null);
    const property = [...walk(model)].find((n) => n.kind === "Property")!;

    const info = describeSemanticId(model, property.data["semanticId"])!;
    expect(info.conceptDescription.kind).toBe("ConceptDescription");
    expect(info.spec).toBeNull();
    expect(info.preferredName).toBeNull();
    expect(info.choices).toEqual([]);
  });

  it("Spezifikation ohne valueList: das Wertfeld bleibt Freitext", () => {
    const model = umgebung({ preferredName: [{ language: "de", text: "Nur ein Name" }] });
    const property = [...walk(model)].find((n) => n.kind === "Property")!;

    const info = describeSemanticId(model, property.data["semanticId"])!;
    expect(info.preferredName).toBe("Nur ein Name");
    expect(info.choices).toEqual([]);
  });

  it("valueList ohne valueId ist erlaubt, der Wert steht trotzdem zur Wahl", () => {
    const model = umgebung({ valueList: { valueReferencePairs: [{ value: "nur-wert" }] } });
    const property = [...walk(model)].find((n) => n.kind === "Property")!;

    const info = describeSemanticId(model, property.data["semanticId"])!;
    expect(info.choices).toEqual([{ value: "nur-wert", valueId: null }]);
  });

  it("iec61360Of vertraegt eine andere dataSpecificationContent-Art", () => {
    const model = normalize({
      conceptDescriptions: [
        {
          id: "x",
          modelType: "ConceptDescription",
          embeddedDataSpecifications: [
            {
              dataSpecification: referenceAuf("y"),
              dataSpecificationContent: { modelType: "IrgendwasAnderes" },
            },
          ],
        },
      ],
    });
    const cd = [...walk(model)].find((n) => n.kind === "ConceptDescription")!;
    expect(iec61360Of(cd)).toBeNull();
  });

  it("valueChoices vertraegt null", () => {
    expect(valueChoices(null)).toEqual([]);
    expect(valueChoices({})).toEqual([]);
  });
});
