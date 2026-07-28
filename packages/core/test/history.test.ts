import { describe, expect, it } from "vitest";

import { applyChange, emptyHistory, redo, undo } from "../src/model/history.js";
import { denormalize, normalize } from "../src/model/normalize.js";
import type { EditorModel } from "../src/model/store.js";

/**
 * Abnahme Phase 1: Undo und Redo stellen den Ausgangsstand exakt wieder her,
 * und die dabei erzeugten Patches sind derselbe Kanal, der spaeter den Worker speist.
 */

function sampleModel(): EditorModel {
  return normalize({
    submodels: [
      {
        id: "https://example.com/sm/1",
        idShort: "TechnicalData",
        modelType: "Submodel",
        submodelElements: [
          { idShort: "MaxTemperature", valueType: "xs:string", value: "80", modelType: "Property" },
        ],
      },
    ],
  });
}

describe("Undo und Redo", () => {
  it("stellt den Ausgangsstand exakt wieder her", () => {
    const start = sampleModel();
    const before = JSON.stringify(denormalize(start));

    const step1 = applyChange(start, emptyHistory, "Wert geaendert", (draft) => {
      draft.nodes["n2"]!.data["value"] = "95";
    });
    const step2 = applyChange(step1.model, step1.history, "idShort geaendert", (draft) => {
      draft.nodes["n1"]!.data["idShort"] = "Technisch";
    });

    expect(JSON.stringify(denormalize(step2.model))).not.toBe(before);

    const back1 = undo(step2.model, step2.history);
    const back2 = undo(back1!.model, back1!.history);

    expect(JSON.stringify(denormalize(back2!.model))).toBe(before);
    expect(back2!.history.past).toHaveLength(0);
    expect(back2!.history.future).toHaveLength(2);
  });

  it("laesst sich wieder vorwaerts abspielen", () => {
    const start = sampleModel();
    const step = applyChange(start, emptyHistory, "Wert geaendert", (draft) => {
      draft.nodes["n2"]!.data["value"] = "95";
    });
    const after = JSON.stringify(denormalize(step.model));

    const back = undo(step.model, step.history)!;
    const forward = redo(back.model, back.history)!;

    expect(JSON.stringify(denormalize(forward.model))).toBe(after);
    expect(forward.history.future).toHaveLength(0);
  });

  it("erzeugt Patches statt eines Vollmodells, unabhaengig von der Modellgroesse", () => {
    const step = applyChange(sampleModel(), emptyHistory, "Wert geaendert", (draft) => {
      draft.nodes["n2"]!.data["value"] = "95";
    });

    expect(step.change.patches).toEqual([
      { op: "replace", path: ["nodes", "n2", "data", "value"], value: "95" },
    ]);
    expect(step.change.inverse).toEqual([
      { op: "replace", path: ["nodes", "n2", "data", "value"], value: "80" },
    ]);
  });

  it("verwirft den Redo-Stapel bei einer neuen Aenderung", () => {
    const step = applyChange(sampleModel(), emptyHistory, "a", (draft) => {
      draft.nodes["n2"]!.data["value"] = "95";
    });
    const back = undo(step.model, step.history)!;
    expect(back.history.future).toHaveLength(1);

    const neu = applyChange(back.model, back.history, "b", (draft) => {
      draft.nodes["n2"]!.data["value"] = "12";
    });
    expect(neu.history.future).toHaveLength(0);
  });
});
