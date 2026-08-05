import type { JsonObject } from "./json.js";

/**
 * Stabile interne Kennung eines Knotens. Bewusst **nicht** die fachliche `id` oder
 * `idShort`, die darf der Nutzer jederzeit aendern (Plan Abschnitt 5).
 */
export type NodeId = string;

export interface EditorNode {
  readonly nodeId: NodeId;
  /** aas-core-Klassenname, entspricht `modelType` wo das JSON eines traegt */
  kind: string;
  /** null nur beim Wurzelknoten Environment */
  parent: NodeId | null;
  /** Slot im Elternteil, ueber den dieser Knoten haengt, etwa "submodelElements" */
  slot: string | null;
  /** Eigene Eigenschaften ohne die Kind-Slots */
  data: JsonObject;
  /** Kinder je Slot. Die Reihenfolge ist bedeutungstragend, siehe SubmodelElementList. */
  children: Record<string, NodeId[]>;
}

/**
 * Normalisiertes Editor-Modell: flache Map statt Baum, damit Zugriff O(1) ist,
 * Virtualisierung sauber funktioniert und Undo ueber Immer-Patches billig bleibt.
 */
export interface EditorModel {
  readonly rootId: NodeId;
  nodes: Record<NodeId, EditorNode>;
  /** Zaehler fuer die naechste nodeId, damit Kennungen ueber Aenderungen hinweg stabil bleiben */
  nextNodeId: number;
}

export function getNode(model: EditorModel, nodeId: NodeId): EditorNode {
  const node = model.nodes[nodeId];
  if (!node) throw new Error(`Unknown nodeId: ${nodeId}`);
  return node;
}

/** Alle Nachfahren in Dokumentreihenfolge, den Knoten selbst eingeschlossen. */
export function* walk(model: EditorModel, from: NodeId = model.rootId): Generator<EditorNode> {
  const node = getNode(model, from);
  yield node;
  for (const ids of Object.values(node.children)) {
    for (const childId of ids) yield* walk(model, childId);
  }
}

export function countNodes(model: EditorModel): number {
  return Object.keys(model.nodes).length;
}
