import { applyPatches, enablePatches, produceWithPatches, type Patch } from "immer";

import type { EditorModel } from "./store.js";

/**
 * Undo und Redo ueber Immer-Patches. Dieselben Patches treiben die Worker-Bruecke
 * (Plan Abschnitt 4): einmal erzeugt, doppelt genutzt. Der Datenverkehr zum Worker
 * bleibt dadurch konstant, unabhaengig von der Modellgroesse.
 */

enablePatches();

export interface Change {
  /** Kurze, dem Nutzer zeigbare Beschreibung, etwa "Property angelegt" */
  readonly label: string;
  readonly patches: readonly Patch[];
  readonly inverse: readonly Patch[];
}

export interface History {
  readonly past: readonly Change[];
  readonly future: readonly Change[];
}

export const emptyHistory: History = { past: [], future: [] };

export interface ApplyResult {
  readonly model: EditorModel;
  readonly history: History;
  readonly change: Change;
}

/**
 * Fuehrt eine Aenderung aus und liefert das neue Modell, die fortgeschriebene Historie
 * und die Patches. Ein Redo-Stapel wird durch eine neue Aenderung verworfen.
 */
export function applyChange(
  model: EditorModel,
  history: History,
  label: string,
  recipe: (draft: EditorModel) => void,
): ApplyResult {
  const [next, patches, inverse] = produceWithPatches(model, recipe);
  const change: Change = { label, patches, inverse };
  return {
    model: next,
    history: { past: [...history.past, change], future: [] },
    change,
  };
}

export interface StepResult {
  readonly model: EditorModel;
  readonly history: History;
  /** Die anzuwendenden Patches, damit der Worker-Spiegel mitgezogen werden kann */
  readonly patches: readonly Patch[];
}

export function undo(model: EditorModel, history: History): StepResult | null {
  const change = history.past.at(-1);
  if (!change) return null;
  return {
    model: applyPatches(model, change.inverse as Patch[]),
    history: { past: history.past.slice(0, -1), future: [change, ...history.future] },
    patches: change.inverse,
  };
}

export function redo(model: EditorModel, history: History): StepResult | null {
  const change = history.future[0];
  if (!change) return null;
  return {
    model: applyPatches(model, change.patches as Patch[]),
    history: { past: [...history.past, change], future: history.future.slice(1) },
    patches: change.patches,
  };
}

export { applyPatches };
export type { Patch };
