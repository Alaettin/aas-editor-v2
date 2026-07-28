import { isIdentifiableKind } from "../model/kinds.js";
import { buildPathIndex } from "../model/paths.js";
import { getNode, walk, type EditorModel, type NodeId } from "../model/store.js";
import type { ImportWarning } from "./types.js";

/**
 * Eindeutigkeit und Kollisionen (Plan Abschnitt 6).
 *
 * **Hier irren viele Implementierungen.** Constraint AASd-022 fordert Eindeutigkeit von
 * `idShort` nur fuer non-identifiable Referables innerhalb desselben Namespace. Er gilt
 * **nicht** fuer Identifiables. Eine Umgebung darf mehrere Submodels mit identischem
 * `idShort` enthalten, solange die `id` verschieden ist. Das ist ein legitimer Fall
 * (Versionierung, parallele Varianten) und wird hier ausdruecklich **nicht** gemeldet.
 */

export interface IdConflict {
  readonly id: string;
  readonly nodeIds: readonly NodeId[];
}

/** Doppelte `id` unter den Identifiables. Nur das ist ein echter Fehler. */
export function findDuplicateIds(model: EditorModel): IdConflict[] {
  const byId = new Map<string, NodeId[]>();

  for (const node of walk(model)) {
    if (!isIdentifiableKind(node.kind)) continue;
    const id = node.data["id"];
    if (typeof id !== "string") continue;
    const bucket = byId.get(id);
    if (bucket) bucket.push(node.nodeId);
    else byId.set(id, [node.nodeId]);
  }

  return [...byId.entries()]
    .filter(([, nodeIds]) => nodeIds.length > 1)
    .map(([id, nodeIds]) => ({ id, nodeIds }));
}

export interface IdShortConflict {
  readonly idShort: string;
  readonly parentId: NodeId;
  readonly nodeIds: readonly NodeId[];
}

/**
 * Doppelter `idShort` unter non-identifiable Geschwistern.
 * Ausgenommen sind Kinder einer `SubmodelElementList`, dort wird ueber den Index
 * adressiert und der `idShort` ist bedeutungslos.
 */
export function findDuplicateIdShorts(model: EditorModel): IdShortConflict[] {
  const out: IdShortConflict[] = [];

  for (const parent of walk(model)) {
    if (parent.kind === "SubmodelElementList") continue;

    for (const ids of Object.values(parent.children)) {
      const seen = new Map<string, NodeId[]>();
      for (const childId of ids) {
        const child = getNode(model, childId);
        if (isIdentifiableKind(child.kind)) continue;
        const idShort = child.data["idShort"];
        if (typeof idShort !== "string" || idShort.length === 0) continue;
        const bucket = seen.get(idShort);
        if (bucket) bucket.push(childId);
        else seen.set(idShort, [childId]);
      }

      for (const [idShort, nodeIds] of seen) {
        if (nodeIds.length > 1) out.push({ idShort, parentId: parent.nodeId, nodeIds });
      }
    }
  }

  return out;
}

export function collectCollisionWarnings(model: EditorModel): ImportWarning[] {
  const index = buildPathIndex(model);
  const warnings: ImportWarning[] = [];

  for (const conflict of findDuplicateIds(model)) {
    warnings.push({
      kind: "kollision",
      message: `Die id ${conflict.id} kommt ${conflict.nodeIds.length} mal vor. Identifiables muessen ueber ihre id eindeutig sein.`,
      path: index.byNode.get(conflict.nodeIds[1] as NodeId) ?? "",
    });
  }

  for (const conflict of findDuplicateIdShorts(model)) {
    warnings.push({
      kind: "kollision",
      message: `Der idShort ${conflict.idShort} kommt unter denselben Geschwistern mehrfach vor.`,
      path: index.byNode.get(conflict.nodeIds[1] as NodeId) ?? "",
    });
  }

  return warnings;
}

export type MergeStrategy = "ueberspringen" | "ersetzen" | "neue-id";

export interface MergePlanEntry {
  readonly id: string;
  readonly incomingNodeId: NodeId;
  readonly existingNodeId: NodeId;
}

/**
 * Kollisionen beim Import in eine bereits geoeffnete Umgebung. Der Nutzer entscheidet
 * je Treffer: ueberspringen, ersetzen oder neue `id` vergeben (Plan Abschnitt 6).
 * Verglichen wird ausschliesslich die `id`.
 */
export function planMerge(existing: EditorModel, incoming: EditorModel): MergePlanEntry[] {
  const known = new Map<string, NodeId>();
  for (const node of walk(existing)) {
    if (!isIdentifiableKind(node.kind)) continue;
    const id = node.data["id"];
    if (typeof id === "string") known.set(id, node.nodeId);
  }

  const out: MergePlanEntry[] = [];
  for (const node of walk(incoming)) {
    if (!isIdentifiableKind(node.kind)) continue;
    const id = node.data["id"];
    if (typeof id !== "string") continue;
    const existingNodeId = known.get(id);
    if (existingNodeId) out.push({ id, incomingNodeId: node.nodeId, existingNodeId });
  }

  return out;
}
