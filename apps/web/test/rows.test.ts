import { normalize, type JsonObject } from "@aas-editor/core";
import { describe, expect, it } from "vitest";

import { buildRows, labelOf } from "../src/store/rows";

/**
 * Der Zaehler rechts in der Baumzeile nennt den tatsaechlichen Bestand, auch waehrend ein
 * Filter laeuft. Waere er gefiltert, spraenge er beim Tippen und saegte an der einzigen
 * Zahl, auf die man sich im Baum verlassen kann.
 */

const UMGEBUNG: JsonObject = {
  assetAdministrationShells: [],
  conceptDescriptions: [],
  submodels: [
    {
      modelType: "Submodel",
      id: "https://example.com/sm/1",
      idShort: "Nameplate",
      submodelElements: [
        { modelType: "Property", idShort: "Alpha", valueType: "xs:string", value: "a" },
        { modelType: "Property", idShort: "Beta", valueType: "xs:string", value: "b" },
        {
          modelType: "SubmodelElementCollection",
          idShort: "Gruppe",
          value: [{ modelType: "Property", idShort: "Gamma", valueType: "xs:string", value: "c" }],
        },
      ],
    },
  ],
};

describe("buildRows", () => {
  const model = normalize(UMGEBUNG);
  const alleOffen = Object.fromEntries(
    Object.keys(model.nodes).map((id) => [id, true as const]),
  );

  it("zaehlt die Kinder je Zeile", () => {
    const zeilen = buildRows(model, alleOffen);
    const nachName = new Map(zeilen.map((zeile) => [zeile.label, zeile]));

    expect(nachName.get("Environment")?.childCount).toBe(1);
    expect(nachName.get("Nameplate")?.childCount).toBe(3);
    expect(nachName.get("Gruppe")?.childCount).toBe(1);
    expect(nachName.get("Alpha")?.childCount).toBe(0);
  });

  it("laesst den Zaehler unter einem Filter unveraendert", () => {
    const gefiltert = buildRows(model, alleOffen, "Gamma");
    const submodel = gefiltert.find((zeile) => zeile.label === "Nameplate");

    expect(submodel?.childCount).toBe(3);
  });

  it("nimmt den idShort als Beschriftung, sonst den Typ", () => {
    const wurzel = model.nodes[model.rootId]!;
    expect(labelOf(wurzel)).toBe("Environment");
  });
});
