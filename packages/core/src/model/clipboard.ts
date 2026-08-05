import { childSlotsOf, isIdentifiableKind } from "./kinds.js";
import { isJsonObject, type JsonObject, type JsonValue } from "./json.js";
import { denormalizeFrom, normalizeFragment } from "./normalize.js";
import { canContain, insertNode, suggestId, uniqueIdShort } from "./operations.js";
import { getNode, walk, type EditorModel, type NodeId } from "./store.js";
import { KernFehler } from "../fehler.js";

/**
 * Kopieren, Ausschneiden und Einfuegen ganzer Teilbaeume (Plan Abschnitt 11, Phase 5).
 *
 * Das Fragment ist gewoehnliches AAS-JSON, kein Editor-Format. Damit laesst sich ein
 * Teilbaum auch in eine andere Anwendung kopieren, und JSON von aussen kommt auf
 * demselben Weg herein.
 */

/** Ein kopierter Teilbaum, so wie er im AAS-JSON aussaehe. */
export interface Fragment {
  /** aas-core-Klassenname des obersten Elements */
  readonly kind: string;
  readonly json: JsonObject;
}

export function copySubtree(model: EditorModel, nodeId: NodeId): Fragment {
  const node = getNode(model, nodeId);
  if (node.parent === null) {
    throw new KernFehler("modell.wurzelNichtKopieren", "The root cannot be copied.");
  }
  return { kind: node.kind, json: denormalizeFrom(model, nodeId) };
}

/**
 * Liest ein Fragment aus beliebigem JSON. Erwartet ein Objekt mit `modelType`, also genau
 * das, was `copySubtree` erzeugt und was auch aus einer AAS-Datei stammen kann.
 */
export function fragmentFromJson(text: string): Fragment {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new KernFehler("modell.keinJson", `Not valid JSON: ${(error as Error).message}`, {
      grund: (error as Error).message,
    });
  }

  if (!isJsonObject(parsed as JsonValue)) {
    throw new KernFehler("modell.keinEinzelobjekt", "Expected a single object.");
  }

  const json = parsed as JsonObject;
  const kind = json["modelType"];
  if (typeof kind !== "string") {
    throw new KernFehler("modell.ohneModelType", "The object has no modelType field.");
  }

  return { kind, json };
}

export type PasteStrategy = "ueberspringen" | "ersetzen" | "neue-id";

export interface PasteConflict {
  /** Die fachliche id, die bereits vergeben ist */
  readonly id: string;
  /** Der vorhandene Knoten, der sie traegt */
  readonly existingNodeId: NodeId;
  readonly kind: string;
}

/**
 * Welche Identifiables des Fragments kollidieren mit der bestehenden Umgebung?
 *
 * Geprueft wird **ausschliesslich die `id`** (Plan Abschnitt 6). Ein gleicher `idShort`
 * ist bei Identifiables kein Konflikt, sondern ein legitimer Fall.
 */
export function findPasteConflicts(model: EditorModel, fragment: Fragment): PasteConflict[] {
  const vergeben = new Map<string, { nodeId: NodeId; kind: string }>();
  for (const node of walk(model)) {
    if (!isIdentifiableKind(node.kind)) continue;
    const id = node.data["id"];
    if (typeof id === "string") vergeben.set(id, { nodeId: node.nodeId, kind: node.kind });
  }

  const konflikte: PasteConflict[] = [];
  for (const id of identifiableIdsOf(fragment.json)) {
    const treffer = vergeben.get(id);
    if (treffer) konflikte.push({ id, existingNodeId: treffer.nodeId, kind: treffer.kind });
  }
  return konflikte;
}

/** Alle `id`-Werte von Identifiables im Fragment, beliebig tief. */
function identifiableIdsOf(json: JsonValue): string[] {
  const out: string[] = [];
  const besuchen = (value: JsonValue): void => {
    if (Array.isArray(value)) {
      for (const entry of value) besuchen(entry);
      return;
    }
    if (!isJsonObject(value)) return;

    const kind = value["modelType"];
    const id = value["id"];
    if (typeof kind === "string" && isIdentifiableKind(kind) && typeof id === "string") {
      out.push(id);
    }
    for (const entry of Object.values(value)) besuchen(entry as JsonValue);
  };
  besuchen(json);
  return out;
}

export interface PasteResult {
  readonly nodeId: NodeId | null;
  /** Was tatsaechlich geschah, fuer die Rueckmeldung an den Nutzer */
  readonly outcome: "eingefuegt" | "ersetzt" | "uebersprungen";
}

/**
 * Fuegt ein Fragment ein. Arbeitet auf dem Draft, damit es durch `applyChange` laeuft.
 *
 * `strategy` greift nur bei Kollisionen. Ohne Kollision wird immer eingefuegt.
 */
export function pasteSubtree(
  draft: EditorModel,
  parentId: NodeId,
  slot: string,
  fragment: Fragment,
  strategy: PasteStrategy = "neue-id",
  index?: number,
): PasteResult {
  const parent = getNode(draft, parentId);
  if (!canContain(parent.kind, slot, fragment.kind, parent.data)) {
    throw new KernFehler(
      "modell.nichtZulaessig",
      `${fragment.kind} is not allowed in ${parent.kind}.${slot}.`,
      { kind: fragment.kind, elternteil: parent.kind, slot },
    );
  }

  const konflikte = findPasteConflicts(draft, fragment);

  if (konflikte.length > 0 && strategy === "ueberspringen") {
    return { nodeId: null, outcome: "uebersprungen" };
  }

  if (konflikte.length > 0 && strategy === "ersetzen") {
    // Die vorhandenen Traeger derselben id weichen. Ihre Kinder gehen mit, das ist der
    // Sinn von "ersetzen".
    for (const konflikt of konflikte) {
      const vorhanden = draft.nodes[konflikt.existingNodeId];
      if (!vorhanden || vorhanden.parent === null) continue;
      const elternteil = getNode(draft, vorhanden.parent);
      const liste = elternteil.children[vorhanden.slot as string];
      if (liste) {
        const at = liste.indexOf(konflikt.existingNodeId);
        if (at >= 0) liste.splice(at, 1);
      }
      for (const nachfahre of [...walk(draft, konflikt.existingNodeId)]) {
        delete draft.nodes[nachfahre.nodeId];
      }
    }
  }

  const json = strategy === "neue-id" ? withFreshIds(fragment.json) : fragment.json;
  const nodeId = einhaengen(draft, parentId, slot, fragment.kind, json, index);

  return {
    nodeId,
    outcome: konflikte.length > 0 && strategy === "ersetzen" ? "ersetzt" : "eingefuegt",
  };
}

/** Vergibt jedem Identifiable im Fragment eine neue, vorlaeufige `id`. */
function withFreshIds(json: JsonObject): JsonObject {
  const kopie = JSON.parse(JSON.stringify(json)) as JsonObject;

  const besuchen = (value: JsonValue): void => {
    if (Array.isArray(value)) {
      for (const entry of value) besuchen(entry);
      return;
    }
    if (!isJsonObject(value)) return;

    const kind = value["modelType"];
    if (typeof kind === "string" && isIdentifiableKind(kind) && typeof value["id"] === "string") {
      value["id"] = suggestId(kind);
    }
    for (const entry of Object.values(value)) besuchen(entry as JsonValue);
  };

  besuchen(kopie);
  return kopie;
}

/**
 * Haengt ein JSON-Fragment als neuen Teilbaum ein.
 *
 * Der Weg fuehrt ueber `normalize`: das Fragment wird als kuenstliche Umgebung
 * normalisiert und dann Knoten fuer Knoten uebernommen. So entsteht dieselbe Struktur wie
 * beim Import, und es gibt nur einen Normalisierer im Projekt.
 */
function einhaengen(
  draft: EditorModel,
  parentId: NodeId,
  slot: string,
  kind: string,
  json: JsonObject,
  index?: number,
): NodeId {
  const parent = getNode(draft, parentId);

  const nodeId = insertNode(draft, parentId, slot, kind, index === undefined ? {} : { index });
  const ziel = getNode(draft, nodeId);

  // Die von insertNode gesetzten Vorbelegungen weichen den echten Daten. Die Kind-Slots
  // gehoeren dabei **nicht** in `data`, sie leben in `children`.
  const slots = new Set(childSlotsOf(kind).map((entry) => entry.name));
  const eigene: JsonObject = {};
  for (const [key, value] of Object.entries(json)) {
    if (value !== undefined && !slots.has(key)) eigene[key] = value as JsonValue;
  }
  ziel.data = eigene;

  // Kinder aus dem Fragment uebernehmen, indem das Fragment fuer sich normalisiert wird.
  const fragmentModel = normalizeFragment(json, kind);
  uebertrageKinder(draft, fragmentModel, fragmentModel.rootId, nodeId);

  // Der idShort muss unter den neuen Geschwistern eindeutig sein, sonst verletzt das
  // Einfuegen sofort AASd-022.
  const idShort = ziel.data["idShort"];
  if (typeof idShort === "string" && idShort && parent.kind !== "SubmodelElementList") {
    ziel.data["idShort"] = uniqueIdShort(draft, parentId, slot, idShort, nodeId);
  }

  return nodeId;
}

function uebertrageKinder(
  draft: EditorModel,
  quelle: EditorModel,
  quelleId: NodeId,
  zielId: NodeId,
): void {
  const quellKnoten = getNode(quelle, quelleId);
  const ziel = getNode(draft, zielId);

  for (const [slot, ids] of Object.entries(quellKnoten.children)) {
    ziel.children[slot] = [];
    for (const kindId of ids) {
      const kind = getNode(quelle, kindId);
      const neueId = `n${draft.nextNodeId++}`;
      draft.nodes[neueId] = {
        nodeId: neueId,
        kind: kind.kind,
        parent: zielId,
        slot,
        data: JSON.parse(JSON.stringify(kind.data)) as JsonObject,
        children: {},
      };
      ziel.children[slot]!.push(neueId);
      uebertrageKinder(draft, quelle, kindId, neueId);
    }
  }
}
