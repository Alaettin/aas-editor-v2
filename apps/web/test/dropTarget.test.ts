import { normalize, type JsonObject } from "@aas-editor/core";
import { describe, expect, it } from "vitest";

import { dropTarget, zielVon } from "../src/store/ablage";
import { buildRows, ordnerId, type TreeRow } from "../src/store/rows";

/**
 * Wohin faellt ein gezogener Knoten?
 *
 * Der Fall, der bis zum 06.08.2026 ins Leere lief: Submodels haengen im Baum unter ihrer
 * Shell, `AssetAdministrationShell.submodels` ist aber eine **Verweisliste**. `canContain`
 * sagt dort nein, und damit gab es fuer Submodels ueberhaupt kein Ablageziel mehr.
 */

const VERWEIS = (nummer: number) => ({
  type: "ModelReference",
  keys: [{ type: "Submodel", value: `https://beispiel.de/sm/${String(nummer)}` }],
});

const UMGEBUNG: JsonObject = {
  assetAdministrationShells: [
    {
      id: "https://beispiel.de/aas/1",
      idShort: "Shell",
      modelType: "AssetAdministrationShell",
      assetInformation: { assetKind: "Instance" },
      submodels: [VERWEIS(1), VERWEIS(2), VERWEIS(3)],
    },
  ],
  submodels: [1, 2, 3].map((n) => ({
    id: `https://beispiel.de/sm/${String(n)}`,
    idShort: `SM${String(n)}`,
    modelType: "Submodel",
    submodelElements: [{ idShort: "Wert", modelType: "Property", valueType: "xs:string" }],
  })),
};

/**
 * Eine Zeile ist 28px hoch. `anteil` sagt, wo im Zeilenrahmen der Zeiger steht: das obere
 * und untere Viertel bedeuten "davor" und "danach", die Mitte "hinein".
 */
function zug(anteil: number) {
  return {
    currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 28 }) },
    clientY: 28 * anteil,
  } as unknown as React.DragEvent;
}

function baum() {
  const model = normalize(UMGEBUNG);
  // Alles offen, sonst gibt es die Submodel-Zeilen gar nicht.
  const offen: Record<string, true> = {};
  for (const id of Object.keys(model.nodes)) offen[id] = true;
  const rows = buildRows(model, offen, "");
  const zeile = (label: string): TreeRow => {
    const treffer = rows.find((r) => r.label === label);
    if (!treffer) throw new Error(`Zeile "${label}" fehlt: ${rows.map((r) => r.label).join(", ")}`);
    return treffer;
  };
  return { model, zeile };
}

describe("Ablageziel im Baum", () => {
  it("ordnet ein Submodel unter derselben Shell um", () => {
    const { model, zeile } = baum();
    const erstes = zeile("SM1");
    const drittes = zeile("SM3");

    const ziel = dropTarget(model, erstes.nodeId, drittes, zug(0.9), erstes);

    expect(ziel).not.toBeNull();
    expect(ziel!.verweis, "Verweisliste statt Kind-Slot").toBe(true);
    expect(ziel!.parentId).toBe(erstes.parentId);
    // Hinter die dritte Zeile, also Index 3 vor der Entnahme.
    expect(ziel!.index).toBe(3);
    expect(ziel!.where).toBe("after");
  });

  it("nimmt beim oberen Rand die Stelle davor", () => {
    const { model, zeile } = baum();
    const drittes = zeile("SM3");
    const erstes = zeile("SM1");

    const ziel = dropTarget(model, drittes.nodeId, erstes, zug(0.1), drittes);

    expect(ziel!.verweis).toBe(true);
    expect(ziel!.index).toBe(0);
    expect(ziel!.where).toBe("before");
  });

  it("macht aus der Mitte ein Danach, weil ein Submodel kein Submodel aufnimmt", () => {
    const { model, zeile } = baum();
    const erstes = zeile("SM1");
    const zweites = zeile("SM2");

    // Die Mitte heisst sonst "hinein". Gibt es keinen passenden Slot, faellt die
    // Entscheidung auf die Geschwisterstelle zurueck, statt gar nichts zu tun.
    const ziel = dropTarget(model, erstes.nodeId, zweites, zug(0.5), erstes);
    expect(ziel!.verweis).toBe(true);
    expect(ziel!.where).toBe("after");
  });

  it("laesst ein Submodel nicht in ein Property fallen", () => {
    const { model, zeile } = baum();
    const erstes = zeile("SM1");
    const wert = zeile("Wert");

    expect(dropTarget(model, erstes.nodeId, wert, zug(0.5), erstes)).toBeNull();
  });

  it("erlaubt weiterhin echtes Verschieben von Elementen", () => {
    const { model, zeile } = baum();
    const wert = zeile("Wert");
    const zweites = zeile("SM2");

    const ziel = dropTarget(model, wert.nodeId, zweites, zug(0.5), wert);

    expect(ziel).not.toBeNull();
    expect(ziel!.verweis, "ein Property haengt wirklich um").toBeUndefined();
    expect(ziel!.slot).toBe("submodelElements");
    expect(ziel!.parentId).toBe(zweites.nodeId);
  });
});

describe("Ziel einer Zeile", () => {
  it("loest eine Ordnerzeile auf die Wurzel und ihren Slot auf", () => {
    const model = normalize(UMGEBUNG);
    const ziel = zielVon(model, ordnerId("conceptDescriptions"));

    expect(ziel).toEqual({ parentId: model.rootId, festerSlot: "conceptDescriptions" });
  });

  it("laesst einen echten Knoten seinen eigenen Ort sein", () => {
    const model = normalize(UMGEBUNG);
    const ziel = zielVon(model, model.rootId);

    expect(ziel).toEqual({ parentId: model.rootId, festerSlot: null });
  });

  it("kennt keinen Ort fuer eine unbekannte Kennung", () => {
    const model = normalize(UMGEBUNG);
    expect(zielVon(model, "n999")).toBeNull();
  });
});
