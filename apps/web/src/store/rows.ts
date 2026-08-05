import {
  childSlotsOf,
  isJsonObject,
  search,
  type EditorModel,
  type EditorNode,
  type JsonValue,
  type NodeId,
} from "@aas-editor/core";

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
  /**
   * Unterscheidungsmerkmal, wenn Geschwister denselben idShort tragen (Plan Abschnitt 6).
   * Version aus `administration`, sonst gekuerzte `id`, sonst `semanticId`.
   */
  readonly disambiguator: string | null;
  /** Treffer der laufenden Suche, nur zur Hervorhebung */
  readonly matched: boolean;
  readonly hasChildren: boolean;
  /** Zahl der Kinder ueber alle Slots, fuer den Zaehler rechts in der Zeile */
  readonly childCount: number;
  readonly expanded: boolean;
  /** Slot im Elternteil, null bei der Wurzel */
  readonly slot: string | null;
  /** Position innerhalb des Slots */
  readonly index: number;
  readonly parentId: NodeId | null;
}

/** Anzeigename eines Knotens: idShort, sonst der Typ. Wie in der Baumzeile. */
export function labelOf(node: EditorNode): string {
  const idShort = node.data["idShort"];
  return typeof idShort === "string" && idShort.length > 0 ? idShort : node.kind;
}

export function buildRows(
  model: EditorModel,
  expanded: Record<NodeId, true>,
  filter = "",
): TreeRow[] {
  const rows: TreeRow[] = [];

  // Beim Filtern zeigt der Baum die Treffer **mit ihrer Elternkette**, damit sie im
  // Zusammenhang stehen bleiben. Ein Treffer ohne sein Submodel waere wertlos.
  const treffer = filter.trim() === "" ? null : new Set(search(model, filter, 500).map((h) => h.nodeId));
  const sichtbar = treffer ? withAncestors(model, treffer) : null;

  const visit = (
    nodeId: NodeId,
    depth: number,
    slot: string | null,
    index: number,
    parentId: NodeId | null,
  ): void => {
    const node = model.nodes[nodeId];
    if (!node) return;
    if (sichtbar && !sichtbar.has(nodeId)) return;

    const slots = childSlotsOf(node.kind);
    let hasChildren = false;
    let childCount = 0;
    for (const entry of slots) {
      const ids = node.children[entry.name];
      if (!ids) continue;
      // Der Zaehler nennt den tatsaechlichen Bestand, auch wenn ein Filter laeuft: die
      // gefilterte Zahl waere eine andere Aussage und wuerde beim Tippen springen.
      childCount += ids.length;
      if (sichtbar ? ids.some((id) => sichtbar.has(id)) : ids.length > 0) hasChildren = true;
    }

    // Beim Filtern wird alles aufgeklappt, sonst faende man die Treffer nicht.
    const isOpen = sichtbar ? true : Boolean(expanded[nodeId]);
    const idShort = node.data["idShort"];
    const id = node.data["id"];

    rows.push({
      nodeId,
      depth,
      kind: node.kind,
      label: typeof idShort === "string" && idShort.length > 0 ? idShort : node.kind,
      id: typeof id === "string" ? id : null,
      disambiguator: disambiguatorOf(model, node, parentId, slot),
      matched: treffer ? treffer.has(nodeId) : false,
      hasChildren,
      childCount,
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

/** Die Treffer plus alle ihre Vorfahren, damit der Baum zusammenhaengend bleibt. */
function withAncestors(model: EditorModel, treffer: ReadonlySet<NodeId>): Set<NodeId> {
  const out = new Set<NodeId>();
  for (const nodeId of treffer) {
    let current: NodeId | null = nodeId;
    while (current !== null && !out.has(current)) {
      out.add(current);
      current = model.nodes[current]?.parent ?? null;
    }
  }
  return out;
}

/**
 * Unterscheidungsmerkmal, wenn Geschwister denselben idShort tragen.
 *
 * Plan Abschnitt 6: gleicher idShort bei verschiedener id ist **kein Fehler**, sondern
 * ein legitimer Fall (Versionierung, parallele Varianten). Statt einer Warnung zeigt die
 * Oberflaeche, was die beiden unterscheidet.
 */
function disambiguatorOf(
  model: EditorModel,
  node: EditorNode,
  parentId: NodeId | null,
  slot: string | null,
): string | null {
  const idShort = node.data["idShort"];
  if (typeof idShort !== "string" || idShort === "" || !parentId || !slot) return null;

  const geschwister = model.nodes[parentId]?.children[slot] ?? [];
  const doppelt = geschwister.some(
    (id) => id !== node.nodeId && model.nodes[id]?.data["idShort"] === idShort,
  );
  if (!doppelt) return null;

  const administration = node.data["administration"];
  if (isJsonObject(administration)) {
    const version = administration["version"];
    const revision = administration["revision"];
    if (typeof version === "string" && version) {
      return typeof revision === "string" && revision ? `v${version}.${revision}` : `v${version}`;
    }
  }

  const id = node.data["id"];
  if (typeof id === "string" && id) return shortenMiddle(id, 28);

  return semanticIdOf(node.data["semanticId"]);
}

function semanticIdOf(reference: JsonValue | undefined): string | null {
  if (!isJsonObject(reference)) return null;
  const keys = reference["keys"];
  if (!Array.isArray(keys) || keys.length === 0) return null;
  const first = keys[0];
  if (!isJsonObject(first)) return null;
  const value = first["value"];
  return typeof value === "string" && value ? shortenMiddle(value, 28) : null;
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
