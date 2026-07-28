import { childSlotsOf } from "./kinds.js";
import { isJsonArray, isJsonObject, type JsonObject, type JsonValue } from "./json.js";
import type { EditorModel, EditorNode, NodeId } from "./store.js";

/**
 * Wandelt ein AAS-Environment als JSON in das normalisierte Editor-Modell und zurueck.
 *
 * Bewusst ohne SDK: der Normalisierer ist reine JSON-Arbeit und laesst sich ohne die
 * 401 KB der jsonization testen. Die Bruecke zu den SDK-Objekten liegt in aasCore.ts.
 */

const ROOT_KIND = "Environment";

export function normalize(environment: JsonObject): EditorModel {
  const model: EditorModel = { rootId: "n0", nodes: {}, nextNodeId: 0 };
  buildNode(model, environment, ROOT_KIND, null, null);
  return model;
}

function buildNode(
  model: EditorModel,
  source: JsonObject,
  kind: string,
  parent: NodeId | null,
  slot: string | null,
): NodeId {
  const nodeId = `n${model.nextNodeId++}`;
  const data: JsonObject = {};
  const children: Record<string, NodeId[]> = {};

  const slots = childSlotsOf(kind);
  const slotNames = new Set(slots.map((s) => s.name));

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (!slotNames.has(key)) data[key] = value;
  }

  // Der Knoten muss vor den Kindern in der Map stehen, damit die Reihenfolge in
  // `nodes` der Dokumentreihenfolge entspricht.
  const node: EditorNode = { nodeId, kind, parent, slot, data, children };
  model.nodes[nodeId] = node;

  for (const childSlot of slots) {
    const raw = source[childSlot.name];
    if (raw === undefined) continue;
    if (!isJsonArray(raw)) {
      throw new Error(`${kind}.${childSlot.name} muss eine Liste sein.`);
    }

    const ids: NodeId[] = [];
    for (const [index, entry] of raw.entries()) {
      const unwrapped = childSlot.wrapper ? unwrapOperationVariable(entry, kind, index) : entry;
      if (!isJsonObject(unwrapped)) {
        throw new Error(`${kind}.${childSlot.name}[${index}] ist kein Objekt.`);
      }
      const childKind = unwrapped["modelType"];
      if (typeof childKind !== "string") {
        throw new Error(`${kind}.${childSlot.name}[${index}] hat kein modelType.`);
      }
      ids.push(buildNode(model, unwrapped, childKind, nodeId, childSlot.name));
    }
    children[childSlot.name] = ids;
  }

  return nodeId;
}

function unwrapOperationVariable(entry: JsonValue, kind: string, index: number): JsonValue {
  if (!isJsonObject(entry)) throw new Error(`${kind}: OperationVariable[${index}] ist kein Objekt.`);
  const inner = entry["value"];
  if (inner === undefined) {
    throw new Error(`${kind}: OperationVariable[${index}] hat kein value.`);
  }
  return inner;
}

export function denormalize(model: EditorModel): JsonObject {
  return buildJson(model, model.rootId);
}

function buildJson(model: EditorModel, nodeId: NodeId): JsonObject {
  const node = model.nodes[nodeId];
  if (!node) throw new Error(`Unbekannte nodeId: ${nodeId}`);

  const out: JsonObject = { ...node.data };

  for (const childSlot of childSlotsOf(node.kind)) {
    const ids = node.children[childSlot.name];
    if (ids === undefined) continue;
    const items: JsonValue[] = ids.map((childId) => {
      const child = buildJson(model, childId);
      // OperationVariable traegt im JSON kein modelType, nur `value`.
      return childSlot.wrapper ? { value: child } : child;
    });
    out[childSlot.name] = items;
  }

  return out;
}
