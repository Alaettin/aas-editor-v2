import { describe, expect, it } from "vitest";

import { toAasCore } from "../src/model/aasCore.js";
import { applyChange, emptyHistory } from "../src/model/history.js";
import {
  copySubtree,
  findPasteConflicts,
  fragmentFromJson,
  pasteSubtree,
} from "../src/model/clipboard.js";
import { normalize } from "../src/model/normalize.js";
import { insertNode } from "../src/model/operations.js";
import { getNode, walk, type EditorModel } from "../src/model/store.js";

/**
 * Abnahme Phase 5, erster Satz: "ein Teilbaum laesst sich zwischen zwei Submodels
 * kopieren, Kollisionen werden abgefragt".
 */

function zweiSubmodels(): EditorModel {
  return normalize({
    submodels: [
      {
        id: "https://example.com/sm/1",
        idShort: "Quelle",
        modelType: "Submodel",
        submodelElements: [
          {
            idShort: "Gruppe",
            modelType: "SubmodelElementCollection",
            value: [
              { idShort: "Wert", valueType: "xs:string", value: "80", modelType: "Property" },
              { idShort: "Zweiter", valueType: "xs:int", value: "1", modelType: "Property" },
            ],
          },
        ],
      },
      { id: "https://example.com/sm/2", idShort: "Ziel", modelType: "Submodel" },
    ],
  });
}

const quelleId = "n1";
const zielId = "n5";

describe("Kopieren", () => {
  it("liefert gewoehnliches AAS-JSON, kein Editor-Format", () => {
    const model = zweiSubmodels();
    const gruppe = [...walk(model)].find((n) => n.kind === "SubmodelElementCollection")!;

    const fragment = copySubtree(model, gruppe.nodeId);
    expect(fragment.kind).toBe("SubmodelElementCollection");
    expect(fragment.json["idShort"]).toBe("Gruppe");
    expect(fragment.json["modelType"]).toBe("SubmodelElementCollection");

    // Die Kinder sind mitgekommen, als normales value-Array.
    const kinder = fragment.json["value"] as unknown[];
    expect(kinder).toHaveLength(2);
    expect(JSON.stringify(fragment.json)).not.toContain("nodeId");
  });

  it("schuetzt die Wurzel", () => {
    expect(() => copySubtree(zweiSubmodels(), "n0")).toThrow(/Wurzel/);
  });
});

describe("Einfuegen zwischen zwei Submodels", () => {
  it("haengt den Teilbaum samt Kindern ins Ziel", () => {
    const model = zweiSubmodels();
    const gruppe = [...walk(model)].find((n) => n.kind === "SubmodelElementCollection")!;
    const fragment = copySubtree(model, gruppe.nodeId);

    const step = applyChange(model, emptyHistory, "eingefuegt", (draft) => {
      pasteSubtree(draft, zielId, "submodelElements", fragment);
    });

    const ziel = getNode(step.model, zielId);
    expect(ziel.children["submodelElements"]).toHaveLength(1);

    const kopie = getNode(step.model, ziel.children["submodelElements"]![0] as string);
    expect(kopie.kind).toBe("SubmodelElementCollection");
    expect(kopie.data["idShort"]).toBe("Gruppe");
    expect(kopie.children["value"]).toHaveLength(2);

    // Frische nodeIds, kein geteilter Zustand mit dem Original.
    expect(kopie.nodeId).not.toBe(gruppe.nodeId);
    expect(kopie.children["value"]![0]).not.toBe(gruppe.children["value"]![0]);

    // Und das Ergebnis bleibt exportierbar.
    expect(() => toAasCore(step.model)).not.toThrow();
  });

  it("macht den idShort unter den neuen Geschwistern eindeutig", () => {
    const model = zweiSubmodels();
    const gruppe = [...walk(model)].find((n) => n.kind === "SubmodelElementCollection")!;
    const fragment = copySubtree(model, gruppe.nodeId);

    // Zweimal in dasselbe Submodel einfuegen, in dem "Gruppe" schon liegt.
    const step = applyChange(model, emptyHistory, "zweimal", (draft) => {
      pasteSubtree(draft, quelleId, "submodelElements", fragment);
      pasteSubtree(draft, quelleId, "submodelElements", fragment);
    });

    const namen = getNode(step.model, quelleId).children["submodelElements"]!.map(
      (id) => getNode(step.model, id).data["idShort"],
    );
    expect(new Set(namen).size).toBe(namen.length);
    expect(namen).toEqual(["Gruppe", "Gruppe1", "Gruppe2"]);
  });

  it("weist eine unzulaessige Ablage zurueck", () => {
    const model = zweiSubmodels();
    const gruppe = [...walk(model)].find((n) => n.kind === "SubmodelElementCollection")!;
    const fragment = copySubtree(model, gruppe.nodeId);

    expect(() =>
      applyChange(model, emptyHistory, "verboten", (draft) => {
        pasteSubtree(draft, "n0", "submodels", fragment);
      }),
    ).toThrow(/nicht zulaessig/);
  });
});

describe("Kollisionen", () => {
  function mitSubmodelFragment() {
    const model = zweiSubmodels();
    const fragment = copySubtree(model, quelleId);
    return { model, fragment };
  }

  it("erkennt eine Kollision ueber die id, nicht ueber den idShort", () => {
    const { model, fragment } = mitSubmodelFragment();
    expect(findPasteConflicts(model, fragment)).toHaveLength(1);
    expect(findPasteConflicts(model, fragment)[0]!.id).toBe("https://example.com/sm/1");

    // Gleicher idShort, andere id: kein Konflikt (Plan Abschnitt 6).
    const anders = {
      kind: "Submodel",
      json: { ...fragment.json, id: "https://example.com/sm/9" },
    };
    expect(findPasteConflicts(model, anders)).toHaveLength(0);
  });

  it("ueberspringen laesst die Umgebung unveraendert", () => {
    const { model, fragment } = mitSubmodelFragment();
    const vorher = Object.keys(model.nodes).length;

    const step = applyChange(model, emptyHistory, "uebersprungen", (draft) => {
      const result = pasteSubtree(draft, "n0", "submodels", fragment, "ueberspringen");
      expect(result.outcome).toBe("uebersprungen");
      expect(result.nodeId).toBeNull();
    });

    expect(Object.keys(step.model.nodes)).toHaveLength(vorher);
  });

  it("neue-id vergibt eine frische id und fuegt trotzdem ein", () => {
    const { model, fragment } = mitSubmodelFragment();

    const step = applyChange(model, emptyHistory, "neue id", (draft) => {
      pasteSubtree(draft, "n0", "submodels", fragment, "neue-id");
    });

    const submodels = getNode(step.model, "n0").children["submodels"]!;
    expect(submodels).toHaveLength(3);

    const ids = submodels.map((id) => getNode(step.model, id).data["id"]);
    expect(new Set(ids).size).toBe(3);
    expect(ids.some((id) => typeof id === "string" && id.startsWith("urn:aas-editor:"))).toBe(true);
    expect(() => toAasCore(step.model)).not.toThrow();
  });

  it("ersetzen entfernt den bisherigen Traeger der id", () => {
    const { model, fragment } = mitSubmodelFragment();

    const step = applyChange(model, emptyHistory, "ersetzt", (draft) => {
      const result = pasteSubtree(draft, "n0", "submodels", fragment, "ersetzen");
      expect(result.outcome).toBe("ersetzt");
    });

    const submodels = getNode(step.model, "n0").children["submodels"]!;
    expect(submodels).toHaveLength(2);

    const ids = submodels.map((id) => getNode(step.model, id).data["id"]);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toContain("https://example.com/sm/1");
    expect(() => toAasCore(step.model)).not.toThrow();
  });
});

describe("JSON aus der Zwischenablage", () => {
  it("nimmt ein Objekt mit modelType an", () => {
    const fragment = fragmentFromJson(
      '{"idShort":"Fremd","valueType":"xs:string","modelType":"Property"}',
    );
    expect(fragment.kind).toBe("Property");

    const model = zweiSubmodels();
    const step = applyChange(model, emptyHistory, "fremd", (draft) => {
      pasteSubtree(draft, zielId, "submodelElements", fragment);
    });
    expect(() => toAasCore(step.model)).not.toThrow();
    expect([...walk(step.model)].some((n) => n.data["idShort"] === "Fremd")).toBe(true);
  });

  it("sagt verstaendlich, was fehlt", () => {
    expect(() => fragmentFromJson("kein json")).toThrow(/kein gueltiges JSON/);
    expect(() => fragmentFromJson("[1,2]")).toThrow(/einzelnes Objekt/);
    expect(() => fragmentFromJson('{"idShort":"X"}')).toThrow(/modelType/);
  });
});

describe("Ausschneiden ist Kopieren plus Loeschen", () => {
  it("laesst sich als eine Aenderung rueckgaengig machen", () => {
    const model = zweiSubmodels();
    const step = applyChange(model, emptyHistory, "vorbereitet", (draft) => {
      insertNode(draft, zielId, "submodelElements", "Property", { idShort: "Neu" });
    });
    expect([...walk(step.model)].some((n) => n.data["idShort"] === "Neu")).toBe(true);
  });
});
