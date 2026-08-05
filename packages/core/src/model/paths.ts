import { childSlotsOf } from "./kinds.js";
import type { EditorModel, NodeId } from "./store.js";

/**
 * Abbildung zwischen aas-core-Pfaden und Knoten des Editor-Modells.
 *
 * Plan Abschnitt 7 nennt diese Abbildung das Herzstueck der Live-Validierung: jeder
 * VerificationError traegt einen Pfad wie `.submodels[0].submodelElements[2].idShort`,
 * und nur ueber diese Abbildung landet die Meldung am richtigen Feld.
 *
 * Der Index wird aus dem Modell abgeleitet und nicht im Knoten mitgefuehrt. Sonst wuerde
 * jede Verschiebung im Baum gespeicherte Pfade ungueltig machen.
 */

export interface PathIndex {
  /** aas-core-Pfad eines Knotens auf seine nodeId, etwa ".submodels[0]" */
  readonly byPath: ReadonlyMap<string, NodeId>;
  /** Umkehrung, fuer Sprung von Knoten zu Pfad */
  readonly byNode: ReadonlyMap<NodeId, string>;
}

export interface FieldLocation {
  readonly nodeId: NodeId;
  /**
   * Restpfad innerhalb des Knotens, ohne fuehrenden Punkt.
   * Leer, wenn der Fehler am Knoten selbst haengt.
   * Beispiele: "idShort", "assetInformation.globalAssetId", "qualifiers[0].value".
   */
  readonly field: string;
}

export function buildPathIndex(model: EditorModel): PathIndex {
  const byPath = new Map<string, NodeId>();
  const byNode = new Map<NodeId, string>();

  const visit = (nodeId: NodeId, path: string): void => {
    const node = model.nodes[nodeId];
    if (!node) throw new Error(`Unknown nodeId: ${nodeId}`);
    byPath.set(path, nodeId);
    byNode.set(nodeId, path);

    for (const slot of childSlotsOf(node.kind)) {
      const ids = node.children[slot.name];
      if (!ids) continue;
      ids.forEach((childId, index) => {
        // Die OperationVariable-Huelle ist im aas-core-Pfad eine eigene Stufe,
        // im Baum aber unsichtbar. Sie muss hier mitgezaehlt werden.
        const base = `${path}.${slot.name}[${index}]`;
        visit(childId, slot.wrapper ? `${base}.value` : base);
      });
    }
  };

  visit(model.rootId, "");
  return { byPath, byNode };
}

/**
 * Ordnet einen aas-core-Pfad dem laengsten passenden Knoten zu und liefert den Restpfad
 * als Feldangabe. Der Pfad kommt als Zeichenkette aus `String(error.path)`.
 */
export function resolvePath(index: PathIndex, path: string): FieldLocation | null {
  let candidate = path;

  for (;;) {
    const nodeId = index.byPath.get(candidate);
    if (nodeId !== undefined) {
      const rest = path.slice(candidate.length);
      return { nodeId, field: rest.startsWith(".") ? rest.slice(1) : rest };
    }
    if (candidate === "") return null;
    const cut = lastSegmentStart(candidate);
    if (cut < 0) return null;
    candidate = candidate.slice(0, cut);
  }
}

/** Beginn des letzten Segments, also die Position des letzten "." oder "[". */
function lastSegmentStart(path: string): number {
  const dot = path.lastIndexOf(".");
  const bracket = path.lastIndexOf("[");
  return Math.max(dot, bracket);
}
