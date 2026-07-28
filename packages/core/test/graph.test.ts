import { describe, expect, it } from "vitest";

import { buildGraph, neighborhood } from "../src/graph.js";
import { normalize } from "../src/model/normalize.js";
import { walk } from "../src/model/store.js";

/**
 * Die Beziehungskarte. Wichtigster Punkt: semanticId-Kanten werden auf den tragenden
 * Identifiable zusammengefasst, sonst ist die Karte bei echten Daten unlesbar.
 */

function ref(id: string, type = "GlobalReference") {
  return { type: "ExternalReference", keys: [{ type, value: id }] };
}

function modelRef(id: string, type = "Submodel") {
  return { type: "ModelReference", keys: [{ type, value: id }] };
}

const AAS = "https://example.com/aas/1";
const AAS2 = "https://example.com/aas/2";
const SM = "https://example.com/sm/1";
const SM2 = "https://example.com/sm/2";
const CD = "https://example.com/cd/1";

function umgebung() {
  return normalize({
    assetAdministrationShells: [
      {
        id: AAS,
        idShort: "Pumpe",
        assetInformation: { assetKind: "Instance", globalAssetId: "https://example.com/asset/1" },
        submodels: [modelRef(SM), modelRef(SM2)],
        derivedFrom: modelRef(AAS2, "AssetAdministrationShell"),
        modelType: "AssetAdministrationShell",
      },
      {
        id: AAS2,
        idShort: "Vorlage",
        assetInformation: { assetKind: "Type" },
        modelType: "AssetAdministrationShell",
      },
    ],
    submodels: [
      {
        id: SM,
        idShort: "TechnicalData",
        modelType: "Submodel",
        submodelElements: [
          // Drei Properties, alle auf dieselbe ConceptDescription.
          { idShort: "Wert1", valueType: "xs:string", semanticId: ref(CD), modelType: "Property" },
          { idShort: "Wert2", valueType: "xs:string", semanticId: ref(CD), modelType: "Property" },
          {
            idShort: "Gruppe",
            modelType: "SubmodelElementCollection",
            value: [
              {
                idShort: "Tief",
                valueType: "xs:string",
                semanticId: ref(CD),
                modelType: "Property",
              },
            ],
          },
          {
            idShort: "Beziehung",
            modelType: "RelationshipElement",
            first: modelRef(SM2),
            second: modelRef(SM2),
          },
          { idShort: "Verweis", modelType: "ReferenceElement", value: modelRef(SM2) },
        ],
      },
      { id: SM2, idShort: "Nameplate", modelType: "Submodel" },
    ],
    conceptDescriptions: [{ id: CD, idShort: "Temperatur", modelType: "ConceptDescription" }],
  });
}

describe("Knoten", () => {
  it("nimmt nur die drei Identifiables auf, keine Elemente", () => {
    const graph = buildGraph(umgebung());
    expect(graph.nodes).toHaveLength(5);
    expect(new Set(graph.nodes.map((n) => n.kind))).toEqual(
      new Set(["AssetAdministrationShell", "Submodel", "ConceptDescription"]),
    );
    expect(graph.nodes.some((n) => n.label === "Wert1")).toBe(false);
  });

  it("beschriftet mit idShort und behaelt die fachliche id", () => {
    const graph = buildGraph(umgebung());
    const pumpe = graph.nodes.find((n) => n.label === "Pumpe")!;
    expect(pumpe.aasId).toBe(AAS);
  });

  it("nutzt die nodeId des Editor-Modells als Kennung", () => {
    const model = umgebung();
    const graph = buildGraph(model);
    for (const node of graph.nodes) expect(model.nodes[node.id]).toBeDefined();
  });
});

describe("Kanten", () => {
  it("verbindet Shell und Submodels ueber submodels", () => {
    const graph = buildGraph(umgebung());
    const submodelKanten = graph.edges.filter((e) => e.kind === "submodel");
    expect(submodelKanten).toHaveLength(2);
  });

  it("kennt derivedFrom zwischen zwei Shells", () => {
    const graph = buildGraph(umgebung());
    expect(graph.edges.filter((e) => e.kind === "derivedFrom")).toHaveLength(1);
  });

  it("fasst semanticId-Kanten auf dem tragenden Identifiable zusammen und zaehlt sie", () => {
    // Drei Properties zeigen auf dieselbe CD, davon eine tief in einer Collection.
    // Erwartet: **eine** Kante mit count 3, nicht drei Kanten.
    const graph = buildGraph(umgebung());
    const semantisch = graph.edges.filter((e) => e.kind === "semanticId");
    expect(semantisch).toHaveLength(1);
    expect(semantisch[0]!.count).toBe(3);
  });

  it("haengt Beziehungen und Verweise an den tragenden Identifiable", () => {
    const graph = buildGraph(umgebung());
    const model = umgebung();
    const sm = [...walk(model)].find((n) => n.data["id"] === SM)!;

    const beziehung = graph.edges.filter((e) => e.kind === "relationship");
    expect(beziehung).toHaveLength(1);
    expect(beziehung[0]!.source).toBe(sm.nodeId);
    // first und second zeigen beide auf SM2, also eine Kante mit count 2.
    expect(beziehung[0]!.count).toBe(2);

    expect(graph.edges.filter((e) => e.kind === "reference")).toHaveLength(1);
  });

  it("uebergeht Referenzen, die in dieser Umgebung nicht aufloesbar sind", () => {
    const model = normalize({
      submodels: [
        {
          id: SM,
          idShort: "SM",
          modelType: "Submodel",
          submodelElements: [
            {
              idShort: "Fremd",
              valueType: "xs:string",
              semanticId: ref("https://fremde-welt.example/cd/9"),
              modelType: "Property",
            },
          ],
        },
      ],
    });
    const graph = buildGraph(model);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(0);
  });

  it("erzeugt keine semanticId-Schleife auf sich selbst", () => {
    // Eine ConceptDescription, deren eigene semanticId auf sie selbst zeigt.
    const model = normalize({
      conceptDescriptions: [
        { id: CD, idShort: "Selbst", semanticId: ref(CD), modelType: "ConceptDescription" },
      ],
    });
    expect(buildGraph(model).edges).toHaveLength(0);
  });
});

describe("Nachbarschaft", () => {
  it("liefert bei Tiefe 1 die direkten Nachbarn", () => {
    const model = umgebung();
    const graph = buildGraph(model);
    const cd = graph.nodes.find((n) => n.kind === "ConceptDescription")!;

    const nah = neighborhood(graph, cd.id, 1);
    // Die CD und das Submodel, das auf sie zeigt.
    expect(nah.nodes).toHaveLength(2);
    expect(nah.nodes.map((n) => n.label).sort()).toEqual(["TechnicalData", "Temperatur"]);
  });

  it("waechst mit der Tiefe", () => {
    const graph = buildGraph(umgebung());
    const cd = graph.nodes.find((n) => n.kind === "ConceptDescription")!;

    expect(neighborhood(graph, cd.id, 1).nodes.length).toBe(2);
    // Tiefe 2 zieht die Shell und das zweite Submodel mit herein.
    expect(neighborhood(graph, cd.id, 2).nodes.length).toBeGreaterThan(2);
  });

  it("behaelt nur Kanten, deren beide Enden drin sind", () => {
    const graph = buildGraph(umgebung());
    const cd = graph.nodes.find((n) => n.kind === "ConceptDescription")!;
    const nah = neighborhood(graph, cd.id, 1);

    const ids = new Set(nah.nodes.map((n) => n.id));
    for (const edge of nah.edges) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
  });

  it("liefert nichts fuer einen unbekannten Knoten", () => {
    const graph = buildGraph(umgebung());
    expect(neighborhood(graph, "n999", 2)).toEqual({ nodes: [], edges: [] });
  });
});
