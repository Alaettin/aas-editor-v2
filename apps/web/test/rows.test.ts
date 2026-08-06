import { normalize, type JsonObject } from "@aas-editor/core";
import { describe, expect, it } from "vitest";

import { buildRows, labelOf, ordnerId } from "../src/store/rows";

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
  // "Alles offen" muss die Ordnerzeilen eigens nennen: sie sind keine Knoten des Modells.
  const alleOffen = {
    ...Object.fromEntries(Object.keys(model.nodes).map((id) => [id, true as const])),
    [ordnerId("submodels")]: true as const,
    [ordnerId("conceptDescriptions")]: true as const,
  };

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

/**
 * Die Anzeigehierarchie weicht bewusst vom Modell ab: `AssetAdministrationShell.submodels`
 * ist eine Verweisliste, im Modell sind alle Identifiables Geschwister unter `Environment`.
 * Der Baum zeigt sie trotzdem verschachtelt.
 */
describe("Hierarchie des Baums", () => {
  const submodel = (nummer: number): JsonObject => ({
    modelType: "Submodel",
    id: `https://example.com/sm/${String(nummer)}`,
    idShort: `Teilmodell${String(nummer)}`,
  });
  const shell = (nummer: number, verweise: number[]): JsonObject => ({
    modelType: "AssetAdministrationShell",
    id: `https://example.com/aas/${String(nummer)}`,
    idShort: `Schale${String(nummer)}`,
    assetInformation: { assetKind: "Instance" },
    submodels: verweise.map((n) => ({
      type: "ModelReference",
      keys: [{ type: "Submodel", value: `https://example.com/sm/${String(n)}` }],
    })),
  });

  const zeilenVon = (umgebung: JsonObject) => {
    const modell = normalize(umgebung);
    const offen = {
      ...Object.fromEntries(Object.keys(modell.nodes).map((id) => [id, true as const])),
      [ordnerId("submodels")]: true as const,
      [ordnerId("conceptDescriptions")]: true as const,
    };
    return buildRows(modell, offen);
  };

  it("haengt ein Submodel unter die Shell, die darauf verweist", () => {
    const zeilen = zeilenVon({
      assetAdministrationShells: [shell(1, [1])],
      submodels: [submodel(1)],
    });
    const schale = zeilen.find((zeile) => zeile.label === "Schale1");
    const teil = zeilen.find((zeile) => zeile.label === "Teilmodell1");

    expect(schale?.childCount).toBe(1);
    expect(teil?.parentId).toBe(schale?.nodeId);
    expect(teil?.depth).toBe(2);
  });

  it("sammelt Submodels ohne Verweis in einem Ordner", () => {
    const zeilen = zeilenVon({
      assetAdministrationShells: [shell(1, [1])],
      submodels: [submodel(1), submodel(2)],
    });
    const ordner = zeilen.find((zeile) => zeile.ordner && zeile.slot === "submodels");
    const verwaist = zeilen.find((zeile) => zeile.label === "Teilmodell2");

    expect(ordner?.childCount).toBe(1);
    expect(verwaist?.parentId).toBe(ordner?.nodeId);
  });

  it("zeigt ein von zwei Shells verwiesenes Submodel genau einmal", () => {
    const zeilen = zeilenVon({
      assetAdministrationShells: [shell(1, [1]), shell(2, [1])],
      submodels: [submodel(1)],
    });

    // Eine Zeile kann nur an einem Ort stehen, und die Zeilenkennung muss eindeutig
    // bleiben: `indexRows` und `aria-activedescendant` setzen das voraus.
    expect(zeilen.filter((zeile) => zeile.label === "Teilmodell1")).toHaveLength(1);
    expect(zeilen.find((zeile) => zeile.label === "Schale2")?.childCount).toBe(0);
    expect(zeilen.some((zeile) => zeile.ordner && zeile.slot === "submodels")).toBe(false);
  });

  it("legt ConceptDescriptions in ihren Ordner", () => {
    const zeilen = zeilenVon({
      conceptDescriptions: [
        { modelType: "ConceptDescription", id: "https://example.com/cd/1", idShort: "Begriff" },
      ],
    });
    const ordner = zeilen.find((zeile) => zeile.ordner && zeile.slot === "conceptDescriptions");

    expect(ordner?.label).toBe("ConceptDescriptions");
    expect(ordner?.childCount).toBe(1);
    expect(zeilen.find((zeile) => zeile.label === "Begriff")?.parentId).toBe(ordner?.nodeId);
  });
});
