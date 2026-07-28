import { childSlotsOf, type EditorModel, type NodeId } from "@aas-editor/core";

/**
 * Der Baum als flache Liste sichtbarer Zeilen.
 *
 * Plan Abschnitt 8: der Baum wird aus dem normalisierten Store abgeleitet und mit
 * TanStack Virtual gerendert, statt eine fertige Baumkomponente zu nehmen. Bei einem
 * normalisierten Store ist das wenig Aufwand und gibt volle Kontrolle ueber Tastatur
 * und Drag-and-drop.
 */

export interface TreeRow {
  readonly nodeId: NodeId;
  readonly depth: number;
  readonly kind: string;
  /** Anzeigename: idShort, sonst der Typ */
  readonly label: string;
  /** Fachliche id, nur bei Identifiables gesetzt */
  readonly id: string | null;
  readonly hasChildren: boolean;
  readonly expanded: boolean;
  /** Slot im Elternteil, null bei der Wurzel */
  readonly slot: string | null;
  /** Position innerhalb des Slots */
  readonly index: number;
  readonly parentId: NodeId | null;
}

export function buildRows(
  model: EditorModel,
  expanded: Record<NodeId, true>,
): TreeRow[] {
  const rows: TreeRow[] = [];

  const visit = (
    nodeId: NodeId,
    depth: number,
    slot: string | null,
    index: number,
    parentId: NodeId | null,
  ): void => {
    const node = model.nodes[nodeId];
    if (!node) return;

    const slots = childSlotsOf(node.kind);
    let hasChildren = false;
    for (const entry of slots) {
      if ((node.children[entry.name]?.length ?? 0) > 0) {
        hasChildren = true;
        break;
      }
    }

    const isOpen = Boolean(expanded[nodeId]);
    const idShort = node.data["idShort"];
    const id = node.data["id"];

    rows.push({
      nodeId,
      depth,
      kind: node.kind,
      label: typeof idShort === "string" && idShort.length > 0 ? idShort : node.kind,
      id: typeof id === "string" ? id : null,
      hasChildren,
      expanded: isOpen,
      slot,
      index,
      parentId,
    });

    if (!isOpen || !hasChildren) return;
    for (const entry of slots) {
      const ids = node.children[entry.name];
      if (!ids) continue;
      for (let i = 0; i < ids.length; i += 1) {
        visit(ids[i] as NodeId, depth + 1, entry.name, i, nodeId);
      }
    }
  };

  visit(model.rootId, 0, null, 0, null);
  return rows;
}

/** Ordnet jeder nodeId ihre Zeilennummer zu, fuer Auswahl und Tastaturwege. */
export function indexRows(rows: readonly TreeRow[]): Map<NodeId, number> {
  const index = new Map<NodeId, number>();
  for (let i = 0; i < rows.length; i += 1) index.set(rows[i]!.nodeId, i);
  return index;
}

/** Der Pfad von der Wurzel zum Knoten, fuer die Breadcrumbs. */
export function pathTo(model: EditorModel, nodeId: NodeId): NodeId[] {
  const path: NodeId[] = [];
  let current: NodeId | null = nodeId;
  while (current !== null) {
    path.unshift(current);
    current = model.nodes[current]?.parent ?? null;
  }
  return path;
}

/**
 * Lange IDs mittig kuerzen statt am Ende abschneiden (Plan Abschnitt 8): hinten steht
 * meist der unterscheidende Teil.
 */
export function shortenMiddle(value: string, max = 44): string {
  if (value.length <= max) return value;
  const half = Math.floor((max - 1) / 2);
  return `${value.slice(0, half)}…${value.slice(value.length - half)}`;
}
