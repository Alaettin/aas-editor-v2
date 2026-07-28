import { describe, expect, it } from "vitest";

import { normalize } from "../src/model/normalize.js";
import { parseQuery, search } from "../src/search.js";

const model = normalize({
  assetAdministrationShells: [
    {
      id: "https://example.com/aas/pumpe-1",
      idShort: "Pumpe",
      assetInformation: { assetKind: "Instance", globalAssetId: "https://example.com/asset/1" },
      modelType: "AssetAdministrationShell",
    },
  ],
  submodels: [
    {
      id: "https://example.com/sm/technisch",
      idShort: "TechnicalData",
      modelType: "Submodel",
      submodelElements: [
        {
          idShort: "MaxTemperature",
          valueType: "xs:int",
          value: "80",
          semanticId: {
            type: "ExternalReference",
            keys: [{ type: "GlobalReference", value: "0173-1#02-AAO677#002" }],
          },
          modelType: "Property",
        },
        {
          idShort: "Beschreibung",
          modelType: "MultiLanguageProperty",
          value: [
            { language: "de", text: "Kreiselpumpe fuer Kuehlwasser" },
            { language: "en", text: "Centrifugal pump" },
          ],
        },
        { idShort: "Handbuch", contentType: "application/pdf", modelType: "File" },
      ],
    },
  ],
});

describe("Suche", () => {
  it("versteht eine leere Eingabe als kein Filter, nicht als keine Treffer", () => {
    expect(parseQuery("   ")).toEqual([]);
    expect(search(model, "")).toEqual([]);
  });

  it("findet ueber den idShort, ohne Beachtung der Gross- und Kleinschreibung", () => {
    const hits = search(model, "maxtemp");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.label).toBe("MaxTemperature");
    expect(hits[0]!.fields).toContain("idShort");
  });

  it("findet ueber die id", () => {
    const hits = search(model, "pumpe-1");
    expect(hits.map((h) => h.kind)).toEqual(["AssetAdministrationShell"]);
    expect(hits[0]!.fields).toContain("id");
  });

  it("findet ueber die semanticId, also ueber die Key-Werte", () => {
    const hits = search(model, "0173-1#02-AAO677");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.label).toBe("MaxTemperature");
    expect(hits[0]!.fields).toContain("semanticId");
  });

  it("findet ueber den Wert, auch in Sprachtexten", () => {
    expect(search(model, "80").map((h) => h.label)).toContain("MaxTemperature");

    const hits = search(model, "kreiselpumpe");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.label).toBe("Beschreibung");
    expect(hits[0]!.fields).toContain("value");
  });

  it("findet ueber den Typ", () => {
    const hits = search(model, "MultiLanguageProperty");
    expect(hits.map((h) => h.label)).toEqual(["Beschreibung"]);
  });

  it("versteht mehrere Woerter als UND innerhalb desselben Knotens", () => {
    // Beide Woerter im selben Element: Treffer.
    expect(search(model, "temp 80").map((h) => h.label)).toEqual(["MaxTemperature"]);

    // "Handbuch" und "80" kommen zwar beide in der Umgebung vor, aber nicht im selben
    // Element. Das darf nichts finden.
    expect(search(model, "handbuch 80")).toHaveLength(0);
  });

  it("nennt den Text, der den Treffer belegt", () => {
    const hits = search(model, "kuehlwasser");
    expect(hits[0]!.excerpt).toContain("Kuehlwasser");
  });

  it("achtet auf die Obergrenze", () => {
    expect(search(model, "e", 2)).toHaveLength(2);
  });
});
