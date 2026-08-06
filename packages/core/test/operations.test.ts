import { describe, expect, it } from "vitest";

import { toAasCore, toCanonicalJson } from "../src/model/aasCore.js";
import { applyChange, emptyHistory, undo } from "../src/model/history.js";
import { SUBMODEL_ELEMENT_KINDS } from "../src/model/kinds.js";
import { normalize, denormalize } from "../src/model/normalize.js";
import {
  canContain,
  duplicateNode,
  insertNode,
  insertSubmodelForShell,
  isAncestor,
  moveNode,
  moveSubmodelReference,
  removeNode,
  setField,
  slotsFor,
} from "../src/model/operations.js";
import { submodelsJeShell } from "../src/model/referenzen.js";
import { getNode, walk, type EditorModel } from "../src/model/store.js";
import { wirftSchluessel } from "./schluessel.js";

/**
 * Abnahme Phase 3: jeder der 14 Elementtypen laesst sich anlegen, verschieben,
 * duplizieren und loeschen, und das Modell bleibt dabei jederzeit exportierbar.
 */

function leeresModell(): EditorModel {
  return normalize({
    submodels: [
      { id: "https://example.com/sm/1", idShort: "SM", modelType: "Submodel" },
      { id: "https://example.com/sm/2", idShort: "SM2", modelType: "Submodel" },
    ],
  });
}

const submodelId = "n1";
const zweitesSubmodelId = "n2";

describe("Anlegen", () => {
  it.each(SUBMODEL_ELEMENT_KINDS)(
    "%s laesst sich anlegen und das Modell bleibt exportierbar",
    (kind) => {
      const start = leeresModell();
      const step = applyChange(start, emptyHistory, `${kind} angelegt`, (draft) => {
        insertNode(draft, submodelId, "submodelElements", kind);
      });

      // Der eigentliche Punkt: fehlt ein Pflichtfeld, scheitert schon die
      // Deserialisierung, und damit brechen Validierung und Export.
      expect(() => toAasCore(step.model)).not.toThrow();

      const node = [...walk(step.model)].find((n) => n.kind === kind);
      expect(node, `${kind} wurde nicht eingehaengt`).toBeDefined();
      expect(node!.data["modelType"]).toBe(kind);
      expect(node!.data["idShort"], "neue Elemente brauchen einen idShort").toBeTypeOf("string");
    },
  );

  it("vergibt eindeutige idShorts unter Geschwistern", () => {
    const step = applyChange(leeresModell(), emptyHistory, "drei Properties", (draft) => {
      insertNode(draft, submodelId, "submodelElements", "Property");
      insertNode(draft, submodelId, "submodelElements", "Property");
      insertNode(draft, submodelId, "submodelElements", "Property");
    });

    const namen = getNode(step.model, submodelId).children["submodelElements"]!.map(
      (id) => getNode(step.model, id).data["idShort"],
    );
    expect(new Set(namen).size).toBe(3);
    expect(namen).toEqual(["property", "property1", "property2"]);
  });

  it("gibt Identifiables eine vorlaeufige, erkennbare id", () => {
    const step = applyChange(leeresModell(), emptyHistory, "Submodel angelegt", (draft) => {
      insertNode(draft, "n0", "submodels", "Submodel");
    });
    const neu = [...walk(step.model)].filter((n) => n.kind === "Submodel").at(-1)!;
    expect(neu.data["id"]).toMatch(/^urn:aas-editor:submodel:/);
  });

  it("setzt an die gewuenschte Position statt immer ans Ende", () => {
    const step = applyChange(leeresModell(), emptyHistory, "einfuegen", (draft) => {
      insertNode(draft, submodelId, "submodelElements", "Property", { idShort: "a" });
      insertNode(draft, submodelId, "submodelElements", "Property", { idShort: "c" });
      insertNode(draft, submodelId, "submodelElements", "Property", { idShort: "b", index: 1 });
    });
    const namen = getNode(step.model, submodelId).children["submodelElements"]!.map(
      (id) => getNode(step.model, id).data["idShort"],
    );
    expect(namen).toEqual(["a", "b", "c"]);
  });
});

describe("Zulaessigkeit", () => {
  it("laesst nur DataElements in annotations", () => {
    expect(canContain("AnnotatedRelationshipElement", "annotations", "Property")).toBe(true);
    expect(canContain("AnnotatedRelationshipElement", "annotations", "File")).toBe(true);
    expect(canContain("AnnotatedRelationshipElement", "annotations", "Operation")).toBe(false);
    expect(canContain("AnnotatedRelationshipElement", "annotations", "Entity")).toBe(false);
  });

  it("beachtet typeValueListElement einer SubmodelElementList", () => {
    const nurProperties = { typeValueListElement: "Property" };
    expect(canContain("SubmodelElementList", "value", "Property", nurProperties)).toBe(true);
    expect(canContain("SubmodelElementList", "value", "Blob", nurProperties)).toBe(false);

    const alles = { typeValueListElement: "SubmodelElement" };
    expect(canContain("SubmodelElementList", "value", "Operation", alles)).toBe(true);

    const nurDataElements = { typeValueListElement: "DataElement" };
    expect(canContain("SubmodelElementList", "value", "Range", nurDataElements)).toBe(true);
    expect(canContain("SubmodelElementList", "value", "Capability", nurDataElements)).toBe(false);
  });

  it("laesst in die Environment nur die drei Identifiables", () => {
    expect(canContain("Environment", "submodels", "Submodel")).toBe(true);
    expect(canContain("Environment", "submodels", "Property")).toBe(false);
    expect(canContain("Environment", "conceptDescriptions", "ConceptDescription")).toBe(true);
    expect(canContain("Environment", "assetAdministrationShells", "Submodel")).toBe(false);
  });

  it("kennt unbekannte Slots nicht", () => {
    expect(canContain("Property", "value", "Property")).toBe(false);
    expect(canContain("Capability", "irgendwas", "Property")).toBe(false);
  });

  it("nennt fuer eine Operation alle drei Variablen-Slots", () => {
    const model = normalize({
      submodels: [
        {
          id: "x",
          modelType: "Submodel",
          submodelElements: [{ idShort: "Op", modelType: "Operation" }],
        },
      ],
    });
    const operation = [...walk(model)].find((n) => n.kind === "Operation")!;
    expect(slotsFor(operation, "Property")).toEqual([
      "inputVariables",
      "outputVariables",
      "inoutputVariables",
    ]);
  });

  it("weist das Einhaengen an einer unzulaessigen Stelle zurueck", () => {
    const model = leeresModell();
    wirftSchluessel(
      () =>
        applyChange(model, emptyHistory, "verboten", (draft) => {
          insertNode(draft, "n0", "submodels", "Property");
        }),
      "modell.nichtZulaessig",
    );
  });
});

describe("Loeschen", () => {
  it("entfernt den Teilbaum vollstaendig aus der Map", () => {
    const angelegt = applyChange(leeresModell(), emptyHistory, "Baum", (draft) => {
      const coll = insertNode(draft, submodelId, "submodelElements", "SubmodelElementCollection");
      insertNode(draft, coll, "value", "Property");
      insertNode(draft, coll, "value", "Property");
    });
    const vorher = Object.keys(angelegt.model.nodes).length;

    const coll = [...walk(angelegt.model)].find((n) => n.kind === "SubmodelElementCollection")!;
    const geloescht = applyChange(angelegt.model, angelegt.history, "geloescht", (draft) => {
      removeNode(draft, coll.nodeId);
    });

    expect(Object.keys(geloescht.model.nodes)).toHaveLength(vorher - 3);
    expect(getNode(geloescht.model, submodelId).children["submodelElements"]).toEqual([]);
    expect(() => toAasCore(geloescht.model)).not.toThrow();
  });

  it("laesst sich rueckgaengig machen", () => {
    const angelegt = applyChange(leeresModell(), emptyHistory, "Property", (draft) => {
      insertNode(draft, submodelId, "submodelElements", "Property", { idShort: "Wert" });
    });
    const vorher = toCanonicalJson(toAasCore(angelegt.model));

    const property = [...walk(angelegt.model)].find((n) => n.kind === "Property")!;
    const geloescht = applyChange(angelegt.model, angelegt.history, "weg", (draft) => {
      removeNode(draft, property.nodeId);
    });
    const zurueck = undo(geloescht.model, geloescht.history)!;

    expect(toCanonicalJson(toAasCore(zurueck.model))).toBe(vorher);
  });

  it("schuetzt die Wurzel", () => {
    wirftSchluessel(
      () => applyChange(leeresModell(), emptyHistory, "x", (draft) => removeNode(draft, "n0")),
      "modell.wurzelNichtLoeschen",
    );
  });
});

describe("Verschieben", () => {
  it("haengt ein Element in ein anderes Submodel um", () => {
    const angelegt = applyChange(leeresModell(), emptyHistory, "Property", (draft) => {
      insertNode(draft, submodelId, "submodelElements", "Property", { idShort: "Wert" });
    });
    const property = [...walk(angelegt.model)].find((n) => n.kind === "Property")!;

    const verschoben = applyChange(angelegt.model, angelegt.history, "verschoben", (draft) => {
      moveNode(draft, property.nodeId, zweitesSubmodelId, "submodelElements");
    });

    expect(getNode(verschoben.model, submodelId).children["submodelElements"]).toEqual([]);
    expect(getNode(verschoben.model, zweitesSubmodelId).children["submodelElements"]).toEqual([
      property.nodeId,
    ]);
    expect(getNode(verschoben.model, property.nodeId).parent).toBe(zweitesSubmodelId);
    expect(() => toAasCore(verschoben.model)).not.toThrow();
  });

  it("ordnet innerhalb desselben Slots um", () => {
    const angelegt = applyChange(leeresModell(), emptyHistory, "drei", (draft) => {
      insertNode(draft, submodelId, "submodelElements", "Property", { idShort: "a" });
      insertNode(draft, submodelId, "submodelElements", "Property", { idShort: "b" });
      insertNode(draft, submodelId, "submodelElements", "Property", { idShort: "c" });
    });
    const [erste] = getNode(angelegt.model, submodelId).children["submodelElements"]!;

    const verschoben = applyChange(angelegt.model, angelegt.history, "ans Ende", (draft) => {
      moveNode(draft, erste as string, submodelId, "submodelElements", 2);
    });

    const namen = getNode(verschoben.model, submodelId).children["submodelElements"]!.map(
      (id) => getNode(verschoben.model, id).data["idShort"],
    );
    expect(namen).toEqual(["b", "c", "a"]);
  });

  it("verhindert das Verschieben in den eigenen Nachfahren", () => {
    const angelegt = applyChange(leeresModell(), emptyHistory, "verschachtelt", (draft) => {
      const aussen = insertNode(draft, submodelId, "submodelElements", "SubmodelElementCollection");
      insertNode(draft, aussen, "value", "SubmodelElementCollection");
    });
    const [aussen, innen] = [...walk(angelegt.model)].filter(
      (n) => n.kind === "SubmodelElementCollection",
    );

    expect(isAncestor(angelegt.model, aussen!.nodeId, innen!.nodeId)).toBe(true);
    wirftSchluessel(
      () =>
        applyChange(angelegt.model, angelegt.history, "x", (draft) => {
          moveNode(draft, aussen!.nodeId, innen!.nodeId, "value");
        }),
      "modell.inEigenenNachfahren",
    );
  });

  it("weist eine unzulaessige Ablage zurueck", () => {
    const angelegt = applyChange(leeresModell(), emptyHistory, "vorbereitet", (draft) => {
      insertNode(draft, submodelId, "submodelElements", "Operation");
      insertNode(draft, submodelId, "submodelElements", "AnnotatedRelationshipElement");
    });
    const operation = [...walk(angelegt.model)].find((n) => n.kind === "Operation")!;
    const are = [...walk(angelegt.model)].find((n) => n.kind === "AnnotatedRelationshipElement")!;

    wirftSchluessel(
      () =>
        applyChange(angelegt.model, angelegt.history, "x", (draft) => {
          moveNode(draft, operation.nodeId, are.nodeId, "annotations");
        }),
      "modell.nichtZulaessig",
    );
  });
});

describe("Duplizieren", () => {
  it("kopiert den Teilbaum mit frischen nodeIds direkt hinter das Original", () => {
    const angelegt = applyChange(leeresModell(), emptyHistory, "Baum", (draft) => {
      const coll = insertNode(draft, submodelId, "submodelElements", "SubmodelElementCollection", {
        idShort: "Gruppe",
      });
      insertNode(draft, coll, "value", "Property", { idShort: "Wert" });
    });
    const coll = [...walk(angelegt.model)].find((n) => n.kind === "SubmodelElementCollection")!;

    const dupliziert = applyChange(angelegt.model, angelegt.history, "dupliziert", (draft) => {
      duplicateNode(draft, coll.nodeId);
    });

    const kinder = getNode(dupliziert.model, submodelId).children["submodelElements"]!;
    expect(kinder).toHaveLength(2);
    expect(kinder[0]).toBe(coll.nodeId);

    const kopie = getNode(dupliziert.model, kinder[1] as string);
    expect(kopie.nodeId).not.toBe(coll.nodeId);
    expect(kopie.data["idShort"]).toBe("Gruppe1");
    expect(kopie.children["value"]).toHaveLength(1);
    expect(kopie.children["value"]![0]).not.toBe(coll.children["value"]![0]);
    expect(() => toAasCore(dupliziert.model)).not.toThrow();
  });

  it("gibt einem duplizierten Submodel eine neue id, sonst waere es eine echte Kollision", () => {
    const dupliziert = applyChange(leeresModell(), emptyHistory, "dupliziert", (draft) => {
      duplicateNode(draft, submodelId);
    });
    const submodels = getNode(dupliziert.model, "n0").children["submodels"]!;
    const ids = submodels.map((id) => getNode(dupliziert.model, id).data["id"]);
    expect(new Set(ids).size).toBe(submodels.length);
  });
});

describe("Felder setzen", () => {
  it("loescht die Eigenschaft bei leerem Wert, statt sie leer zu setzen", () => {
    const start = applyChange(leeresModell(), emptyHistory, "Property", (draft) => {
      insertNode(draft, submodelId, "submodelElements", "Property", { idShort: "Wert" });
    });
    const property = [...walk(start.model)].find((n) => n.kind === "Property")!;

    const gesetzt = applyChange(start.model, start.history, "Wert", (draft) => {
      setField(draft, property.nodeId, "value", "80");
    });
    expect(getNode(gesetzt.model, property.nodeId).data["value"]).toBe("80");

    const geleert = applyChange(gesetzt.model, gesetzt.history, "geleert", (draft) => {
      setField(draft, property.nodeId, "value", "");
    });
    expect("value" in getNode(geleert.model, property.nodeId).data).toBe(false);
    expect(JSON.stringify(denormalize(geleert.model))).not.toContain('"value"');
  });
});

describe("Submodels unter einer Shell umsortieren", () => {
  /** Eine Shell, die auf drei Submodels verweist, dazu ein viertes ohne Verweis. */
  function mitShell(): EditorModel {
    const verweis = (nummer: number) => ({
      type: "ModelReference",
      keys: [{ type: "Submodel", value: `https://example.com/sm/${String(nummer)}` }],
    });
    return normalize({
      assetAdministrationShells: [
        {
          id: "https://example.com/aas/1",
          idShort: "Shell",
          modelType: "AssetAdministrationShell",
          assetInformation: { assetKind: "Instance" },
          submodels: [verweis(1), verweis(2), verweis(3)],
        },
      ],
      submodels: [1, 2, 3, 4].map((n) => ({
        id: `https://example.com/sm/${String(n)}`,
        idShort: `SM${String(n)}`,
        modelType: "Submodel",
      })),
    });
  }

  it("schiebt einen Verweis nach hinten", () => {
    const start = mitShell();
    const shellId = [...walk(start)].find((n) => n.kind === "AssetAdministrationShell")!.nodeId;
    const erstes = submodelsJeShell(start).jeShell.get(shellId)![0]!;

    const step = applyChange(start, emptyHistory, "umsortiert", (draft) => {
      moveSubmodelReference(draft, shellId, erstes, 2);
    });

    const namen = submodelsJeShell(step.model)
      .jeShell.get(shellId)!
      .map((id) => getNode(step.model, id).data["idShort"]);
    expect(namen).toEqual(["SM2", "SM1", "SM3"]);
    // Der Rundlauf haengt daran: die Verweisliste muss gueltig bleiben.
    expect(() => toAasCore(step.model)).not.toThrow();
  });

  it("schiebt einen Verweis nach vorn", () => {
    const start = mitShell();
    const shellId = [...walk(start)].find((n) => n.kind === "AssetAdministrationShell")!.nodeId;
    const letztes = submodelsJeShell(start).jeShell.get(shellId)![2]!;

    const step = applyChange(start, emptyHistory, "umsortiert", (draft) => {
      moveSubmodelReference(draft, shellId, letztes, 0);
    });

    const namen = submodelsJeShell(step.model)
      .jeShell.get(shellId)!
      .map((id) => getNode(step.model, id).data["idShort"]);
    expect(namen).toEqual(["SM3", "SM1", "SM2"]);
  });

  it("laesst sich zurueckdrehen", () => {
    const start = mitShell();
    const shellId = [...walk(start)].find((n) => n.kind === "AssetAdministrationShell")!.nodeId;
    const erstes = submodelsJeShell(start).jeShell.get(shellId)![0]!;

    const step = applyChange(start, emptyHistory, "umsortiert", (draft) => {
      moveSubmodelReference(draft, shellId, erstes, 2);
    });
    const zurueck = undo(step.model, step.history)!;

    const namen = submodelsJeShell(zurueck.model)
      .jeShell.get(shellId)!
      .map((id) => getNode(zurueck.model, id).data["idShort"]);
    expect(namen).toEqual(["SM1", "SM2", "SM3"]);
  });

  it("weist ein Submodel zurueck, auf das die Shell nicht zeigt", () => {
    const start = mitShell();
    const shellId = [...walk(start)].find((n) => n.kind === "AssetAdministrationShell")!.nodeId;
    const ohneVerweis = [...walk(start)].find(
      (n) => n.kind === "Submodel" && n.data["idShort"] === "SM4",
    )!.nodeId;

    wirftSchluessel(() => {
      applyChange(start, emptyHistory, "umsortiert", (draft) => {
        moveSubmodelReference(draft, shellId, ohneVerweis, 0);
      });
    }, "modell.verweisFehlt");
  });
});

describe("Teilmodell unter einer Shell anlegen", () => {
  function mitShell(): EditorModel {
    return normalize({
      assetAdministrationShells: [
        {
          id: "https://example.com/aas/1",
          idShort: "Shell",
          modelType: "AssetAdministrationShell",
          assetInformation: { assetKind: "Instance" },
        },
      ],
    });
  }

  it("haengt es unter Environment und laesst die Shell darauf verweisen", () => {
    const start = mitShell();
    const shellId = [...walk(start)].find((n) => n.kind === "AssetAdministrationShell")!.nodeId;

    const step = applyChange(start, emptyHistory, "Submodel angelegt", (draft) => {
      insertSubmodelForShell(draft, shellId);
    });

    // Im Modell ist es ein Geschwister der Shell, nicht ihr Kind.
    const wurzel = getNode(step.model, step.model.rootId);
    expect(wurzel.children["submodels"]).toHaveLength(1);

    // Im Baum steht es trotzdem unter ihr, weil der Verweis gesetzt ist.
    const unterShell = submodelsJeShell(step.model).jeShell.get(shellId)!;
    expect(unterShell).toHaveLength(1);
    expect(getNode(step.model, unterShell[0]!).kind).toBe("Submodel");

    // Und der Rundlauf haelt: eine Shell ohne gueltige Verweise waere nicht exportierbar.
    expect(() => toAasCore(step.model)).not.toThrow();
  });

  it("nimmt Knoten und Verweis in einem Schritt zurueck", () => {
    const start = mitShell();
    const shellId = [...walk(start)].find((n) => n.kind === "AssetAdministrationShell")!.nodeId;

    const step = applyChange(start, emptyHistory, "Submodel angelegt", (draft) => {
      insertSubmodelForShell(draft, shellId);
    });
    const zurueck = undo(step.model, step.history)!;

    expect(getNode(zurueck.model, zurueck.model.rootId).children["submodels"] ?? []).toHaveLength(
      0,
    );
    expect(getNode(zurueck.model, shellId).data["submodels"] ?? []).toHaveLength(0);
  });

  it("legt ein zweites daneben, ohne das erste zu verlieren", () => {
    const start = mitShell();
    const shellId = [...walk(start)].find((n) => n.kind === "AssetAdministrationShell")!.nodeId;

    const step = applyChange(start, emptyHistory, "zwei Submodels", (draft) => {
      insertSubmodelForShell(draft, shellId);
      insertSubmodelForShell(draft, shellId);
    });

    const unterShell = submodelsJeShell(step.model).jeShell.get(shellId)!;
    expect(unterShell).toHaveLength(2);
    // Die vorlaeufigen ids muessen sich unterscheiden, sonst zeigte der zweite Verweis
    // auf dasselbe Teilmodell und eine Zeile verschwaende.
    const ids = unterShell.map((id) => getNode(step.model, id).data["id"]);
    expect(new Set(ids).size).toBe(2);
  });

  it("weist einen Knoten zurueck, der keine Shell ist", () => {
    const start = normalize({
      submodels: [{ id: "https://example.com/sm/1", idShort: "SM", modelType: "Submodel" }],
    });
    const submodel = [...walk(start)].find((n) => n.kind === "Submodel")!.nodeId;

    wirftSchluessel(() => {
      applyChange(start, emptyHistory, "Submodel angelegt", (draft) => {
        insertSubmodelForShell(draft, submodel);
      });
    }, "modell.keineShell");
  });
});
