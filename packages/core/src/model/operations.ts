import { childSlotsOf, isIdentifiableKind, isSubmodelElementKind } from "./kinds.js";
import type { JsonObject, JsonValue } from "./json.js";
import { getNode, walk, type EditorModel, type EditorNode, type NodeId } from "./store.js";
import { KernFehler } from "../fehler.js";

/**
 * Anlegen, Loeschen, Verschieben und Duplizieren von Knoten.
 *
 * Bewusst hier und nicht in React: die Funktionen arbeiten auf dem Immer-Draft und laufen
 * dadurch durch `applyChange`, das Patches erzeugt, die zugleich Undo und den Worker
 * speisen (Plan Abschnitt 4).
 */

// --- Was darf worin liegen ----------------------------------------------------------

/** DataElements im Sinne des Metamodells. Nur sie duerfen in `annotations` stehen. */
const DATA_ELEMENT_KINDS = new Set([
  "Property",
  "MultiLanguageProperty",
  "Range",
  "Blob",
  "File",
  "ReferenceElement",
]);

/**
 * Darf ein Knoten der Art `childKind` in den Slot `slot` eines `parentKind`?
 *
 * `parentData` wird fuer die SubmodelElementList gebraucht: dort schreibt
 * `typeValueListElement` vor, welcher Typ zulaessig ist.
 */
export function canContain(
  parentKind: string,
  slot: string,
  childKind: string,
  parentData?: JsonObject,
): boolean {
  const known = childSlotsOf(parentKind).some((entry) => entry.name === slot);
  if (!known) return false;

  if (parentKind === "Environment") {
    if (slot === "assetAdministrationShells") return childKind === "AssetAdministrationShell";
    if (slot === "submodels") return childKind === "Submodel";
    if (slot === "conceptDescriptions") return childKind === "ConceptDescription";
    return false;
  }

  if (!isSubmodelElementKind(childKind)) return false;

  if (parentKind === "AnnotatedRelationshipElement") return DATA_ELEMENT_KINDS.has(childKind);

  if (parentKind === "SubmodelElementList") {
    const declared = parentData?.["typeValueListElement"];
    if (typeof declared !== "string") return true;
    // Die abstrakten Werte lassen alles beziehungsweise alle DataElements zu.
    if (declared === "SubmodelElement") return true;
    if (declared === "DataElement") return DATA_ELEMENT_KINDS.has(childKind);
    if (declared === "EventElement") return childKind === "BasicEventElement";
    return declared === childKind;
  }

  return true;
}

/** Alle Slots eines Knotens, in die `childKind` passt. */
export function slotsFor(parent: EditorNode, childKind: string): string[] {
  return childSlotsOf(parent.kind)
    .map((slot) => slot.name)
    .filter((slot) => canContain(parent.kind, slot, childKind, parent.data));
}

// --- Anlegen ------------------------------------------------------------------------

const EMPTY_MODEL_REFERENCE: JsonValue = { type: "ModelReference", keys: [] };

/**
 * Tiefe Kopie ueber JSON.
 *
 * `structuredClone` scheitert hier: die Funktionen arbeiten auf Immer-Drafts, und deren
 * Proxys sind nicht klonbar (`DataCloneError`). Die Daten sind per Konstruktion reines
 * JSON, der Umweg ist also verlustfrei.
 */
function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Pflichtfelder je Typ.
 *
 * Wichtig und leicht zu uebersehen: fehlt eines davon, scheitert schon
 * `environmentFromJsonable`, und damit brechen Validierung **und** Export. Ein neu
 * angelegtes Element muss deshalb von der ersten Sekunde an deserialisierbar sein, auch
 * wenn es inhaltlich noch leer ist. `test/operations.test.ts` haelt das fest.
 */
const DEFAULTS: Readonly<Record<string, () => JsonObject>> = {
  Property: () => ({ valueType: "xs:string" }),
  MultiLanguageProperty: () => ({}),
  Range: () => ({ valueType: "xs:string" }),
  Blob: () => ({ contentType: "application/octet-stream" }),
  File: () => ({ contentType: "application/octet-stream" }),
  ReferenceElement: () => ({}),
  RelationshipElement: () => ({
    first: cloneJson(EMPTY_MODEL_REFERENCE),
    second: cloneJson(EMPTY_MODEL_REFERENCE),
  }),
  AnnotatedRelationshipElement: () => ({
    first: cloneJson(EMPTY_MODEL_REFERENCE),
    second: cloneJson(EMPTY_MODEL_REFERENCE),
  }),
  Capability: () => ({}),
  Operation: () => ({}),
  BasicEventElement: () => ({
    observed: cloneJson(EMPTY_MODEL_REFERENCE),
    direction: "input",
    state: "off",
  }),
  Entity: () => ({ entityType: "CoManagedEntity" }),
  SubmodelElementList: () => ({ typeValueListElement: "SubmodelElement" }),
  SubmodelElementCollection: () => ({}),

  AssetAdministrationShell: () => ({ assetInformation: { assetKind: "Instance" } }),
  Submodel: () => ({}),
  ConceptDescription: () => ({}),
};

export interface CreateOptions {
  /** Vorschlag fuer den idShort. Wird bei Bedarf eindeutig gemacht. */
  readonly idShort?: string;
  /** Fachliche id fuer Identifiables. Ohne Angabe wird eine vorgeschlagen. */
  readonly id?: string;
}

/** Die Rohdaten eines neuen Knotens, noch ohne nodeId und ohne Platz im Baum. */
export function newNodeData(kind: string, options: CreateOptions = {}): JsonObject {
  const factory = DEFAULTS[kind];
  // Kein Schluessel: das ist ein Programmierfehler, kein Bedienfehler.
  if (!factory) throw new Error(`Unknown element kind: ${kind}`);

  const data: JsonObject = { ...factory(), modelType: kind };
  if (options.idShort !== undefined) data["idShort"] = options.idShort;
  if (isIdentifiableKind(kind)) data["id"] = options.id ?? suggestId(kind);
  return data;
}

/**
 * Vorschlag fuer eine fachliche `id`. Bewusst eine URN und kein zufaelliger Text: sie
 * soll erkennbar vorlaeufig sein und trotzdem eindeutig.
 */
export function suggestId(kind: string, seed = randomSuffix()): string {
  return `urn:aas-editor:${kind.toLowerCase()}:${seed}`;
}

let counter = 0;
function randomSuffix(): string {
  counter += 1;
  return `${counter.toString(36)}${Math.floor(Math.random() * 0xffffff).toString(36)}`;
}

/**
 * Macht einen idShort unter den Geschwistern eindeutig, indem er durchnummeriert wird.
 *
 * `exclude` nimmt den Knoten aus, der gerade benannt wird. Ohne das wuerde ein Knoten mit
 * sich selbst kollidieren, sobald er bereits eingehaengt ist, und aus "Gruppe" wuerde
 * beim Einfuegen unweigerlich "Gruppe1".
 */
export function uniqueIdShort(
  model: EditorModel,
  parentId: NodeId,
  slot: string,
  wanted: string,
  exclude?: NodeId,
): string {
  const parent = getNode(model, parentId);
  const taken = new Set(
    (parent.children[slot] ?? [])
      .filter((childId) => childId !== exclude)
      .map((childId) => model.nodes[childId]?.data["idShort"])
      .filter((value): value is string => typeof value === "string"),
  );

  if (!taken.has(wanted)) return wanted;
  for (let i = 1; ; i += 1) {
    const candidate = `${wanted}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Legt einen Knoten an und haengt ihn ein. Arbeitet auf dem Draft, gibt die neue nodeId
 * zurueck. Wird `index` weggelassen, landet der Knoten am Ende.
 */
export function insertNode(
  draft: EditorModel,
  parentId: NodeId,
  slot: string,
  kind: string,
  options: CreateOptions & { index?: number } = {},
): NodeId {
  const parent = getNode(draft, parentId);
  if (!canContain(parent.kind, slot, kind, parent.data)) {
    throw new KernFehler(
      "modell.nichtZulaessig",
      `${kind} is not allowed in ${parent.kind}.${slot}.`,
      { kind, elternteil: parent.kind, slot },
    );
  }

  const data = newNodeData(kind, options);
  if (typeof data["idShort"] !== "string" && parent.kind !== "SubmodelElementList") {
    data["idShort"] = uniqueIdShort(draft, parentId, slot, defaultIdShort(kind));
  }

  const nodeId = `n${draft.nextNodeId++}`;
  draft.nodes[nodeId] = { nodeId, kind, parent: parentId, slot, data, children: {} };

  const list = (parent.children[slot] ??= []);
  list.splice(options.index ?? list.length, 0, nodeId);
  return nodeId;
}

function defaultIdShort(kind: string): string {
  return kind.charAt(0).toLowerCase() + kind.slice(1);
}

// --- Loeschen, Verschieben, Duplizieren ----------------------------------------------

/** Entfernt einen Knoten samt Nachfahren und raeumt die Map auf. */
export function removeNode(draft: EditorModel, nodeId: NodeId): void {
  const node = getNode(draft, nodeId);
  if (node.parent === null) {
    throw new KernFehler("modell.wurzelNichtLoeschen", "The root cannot be deleted.");
  }

  const parent = getNode(draft, node.parent);
  const list = parent.children[node.slot as string];
  if (list) {
    const at = list.indexOf(nodeId);
    if (at >= 0) list.splice(at, 1);
  }

  for (const descendant of [...walk(draft, nodeId)]) {
    delete draft.nodes[descendant.nodeId];
  }
}

/**
 * Verschiebt einen Knoten. `index` zaehlt in der Zielliste **nach** dem Entfernen aus der
 * Quelle, damit ein Verschieben innerhalb desselben Slots nicht um eins danebenliegt.
 */
export function moveNode(
  draft: EditorModel,
  nodeId: NodeId,
  targetParentId: NodeId,
  slot: string,
  index?: number,
): void {
  const node = getNode(draft, nodeId);
  const target = getNode(draft, targetParentId);

  if (node.parent === null) {
    throw new KernFehler("modell.wurzelNichtVerschieben", "The root cannot be moved.");
  }
  if (!canContain(target.kind, slot, node.kind, target.data)) {
    throw new KernFehler(
      "modell.nichtZulaessig",
      `${node.kind} is not allowed in ${target.kind}.${slot}.`,
      { kind: node.kind, elternteil: target.kind, slot },
    );
  }
  if (isAncestor(draft, nodeId, targetParentId)) {
    throw new KernFehler(
      "modell.inEigenenNachfahren",
      "A node cannot be moved into its own descendants.",
    );
  }

  const oldParent = getNode(draft, node.parent);
  const oldList = oldParent.children[node.slot as string];
  if (oldList) {
    const at = oldList.indexOf(nodeId);
    if (at >= 0) oldList.splice(at, 1);
  }

  node.parent = targetParentId;
  node.slot = slot;
  const list = (target.children[slot] ??= []);
  list.splice(index ?? list.length, 0, nodeId);
}

/** Liegt `maybeAncestor` auf dem Weg von `nodeId` zur Wurzel, oder ist es derselbe Knoten? */
export function isAncestor(model: EditorModel, maybeAncestor: NodeId, nodeId: NodeId): boolean {
  let current: NodeId | null = nodeId;
  while (current !== null) {
    if (current === maybeAncestor) return true;
    current = model.nodes[current]?.parent ?? null;
  }
  return false;
}

/**
 * Dupliziert einen Teilbaum mit frischen nodeIds. Der neue Knoten landet direkt hinter
 * dem Original. Identifiables bekommen eine neue `id`, sonst entstuende eine echte
 * Kollision (Plan Abschnitt 6).
 */
export function duplicateNode(draft: EditorModel, nodeId: NodeId): NodeId {
  const node = getNode(draft, nodeId);
  if (node.parent === null) {
    throw new KernFehler("modell.wurzelNichtDuplizieren", "The root cannot be duplicated.");
  }

  const parent = getNode(draft, node.parent);
  const slot = node.slot as string;
  const list = parent.children[slot] ?? [];
  const at = list.indexOf(nodeId);

  const copyId = copySubtree(draft, nodeId, node.parent, slot);
  const copy = getNode(draft, copyId);

  if (isIdentifiableKind(copy.kind)) copy.data["id"] = suggestId(copy.kind);
  if (typeof copy.data["idShort"] === "string" && parent.kind !== "SubmodelElementList") {
    copy.data["idShort"] = uniqueIdShort(draft, node.parent, slot, copy.data["idShort"]);
  }

  list.splice(at >= 0 ? at + 1 : list.length, 0, copyId);
  return copyId;
}

function copySubtree(
  draft: EditorModel,
  sourceId: NodeId,
  parentId: NodeId | null,
  slot: string | null,
): NodeId {
  const source = getNode(draft, sourceId);
  const nodeId = `n${draft.nextNodeId++}`;

  const children: Record<string, NodeId[]> = {};
  draft.nodes[nodeId] = {
    nodeId,
    kind: source.kind,
    parent: parentId,
    slot,
    data: cloneJson(source.data),
    children,
  };

  for (const [childSlot, ids] of Object.entries(source.children)) {
    children[childSlot] = ids.map((childId) => copySubtree(draft, childId, nodeId, childSlot));
  }

  return nodeId;
}

// --- Felder setzen -------------------------------------------------------------------

/**
 * Setzt ein Feld eines Knotens. Ein leerer Wert loescht die Eigenschaft, statt sie auf
 * `null` oder `""` zu setzen: die aas-core-Serialisierung laesst leere Felder weg, und
 * ein leerer Text ist etwas anderes als "nicht gesetzt".
 */
export function setField(
  draft: EditorModel,
  nodeId: NodeId,
  key: string,
  value: JsonValue | undefined,
): void {
  const node = getNode(draft, nodeId);
  if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
    delete node.data[key];
    return;
  }
  node.data[key] = value;
}
