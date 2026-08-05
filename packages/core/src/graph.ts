import { isIdentifiableKind } from "./model/kinds.js";
import { isJsonArray, isJsonObject, type JsonValue } from "./model/json.js";
import { walk, type EditorModel, type EditorNode, type NodeId } from "./model/store.js";
import { referenceTarget } from "./semantics.js";

/**
 * Die Beziehungskarte als Datenmodell (Plan Abschnitt 8 und 11, Phase 6).
 *
 * Bewusst ohne jede Darstellungslogik: hier entstehen Knoten und Kanten, das Layout
 * rechnet der Worker, gezeichnet wird in React. Dadurch ist die Karte testbar, ohne
 * einen Browser zu starten.
 *
 * Knoten sind die drei Identifiables. Elemente tief im Baum werden **nicht** zu Knoten,
 * ihre Verweise wandern an den tragenden Identifiable. Sonst waere die Karte bei einem
 * echten Modell mit tausenden Elementen unlesbar, und genau davor warnt der Plan.
 */

export type GraphNodeKind = "AssetAdministrationShell" | "Submodel" | "ConceptDescription";

export interface GraphNode {
  /** Die nodeId des Editor-Modells, damit Auswahl und Sprung ohne Umweg funktionieren */
  readonly id: NodeId;
  readonly kind: GraphNodeKind;
  readonly label: string;
  /** Fachliche id, fuer den Tooltip */
  readonly aasId: string | null;
  /**
   * Wie viele Kinder der Knoten traegt: Submodels je Shell, Elemente je Submodel. Die
   * Karte im Graphen zeigt das in ihrer dritten Zeile, und das soll eine echte Zahl sein.
   */
  readonly childCount: number;
}

export type GraphEdgeKind =
  /** AssetAdministrationShell.submodels */
  | "submodel"
  /** AssetAdministrationShell.derivedFrom */
  | "derivedFrom"
  /** semanticId irgendwo im Teilbaum, auf eine ConceptDescription */
  | "semanticId"
  /** RelationshipElement.first und .second */
  | "relationship"
  /** ReferenceElement.value */
  | "reference";

export interface GraphEdge {
  readonly id: string;
  readonly source: NodeId;
  readonly target: NodeId;
  readonly kind: GraphEdgeKind;
  /**
   * Wie viele Einzelverweise diese Kante zusammenfasst. Ein Submodel mit 200 Properties,
   * die alle auf dieselbe ConceptDescription zeigen, ergibt **eine** Kante mit count 200.
   */
  readonly count: number;
}

export interface Graph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

/**
 * Was die Karte im Graphen als Bestand nennt.
 *
 * Bei einem Submodel sind das die Kindelemente, bei einer Shell die Zahl der verwiesenen
 * Submodels: die haengen nicht als Kinder darunter, sondern stehen als Referenzliste im
 * Knoten selbst.
 */
function childCountOf(node: EditorNode): number {
  if (node.kind === "AssetAdministrationShell") {
    const verweise = node.data["submodels"];
    return isJsonArray(verweise) ? verweise.length : 0;
  }
  return Object.values(node.children).reduce((summe, ids) => summe + ids.length, 0);
}

export function buildGraph(model: EditorModel): Graph {
  const nodes: GraphNode[] = [];
  /** fachliche id auf nodeId, damit Referenzen aufloesbar werden */
  const byAasId = new Map<string, NodeId>();
  /** nodeId eines beliebigen Knotens auf den tragenden Identifiable darueber */
  const traeger = new Map<NodeId, NodeId>();

  for (const node of walk(model)) {
    if (isIdentifiableKind(node.kind)) {
      const id = node.data["id"];
      const idShort = node.data["idShort"];
      nodes.push({
        id: node.nodeId,
        kind: node.kind as GraphNodeKind,
        label: typeof idShort === "string" && idShort ? idShort : node.kind,
        aasId: typeof id === "string" ? id : null,
        childCount: childCountOf(node),
      });
      if (typeof id === "string") byAasId.set(id, node.nodeId);
      traeger.set(node.nodeId, node.nodeId);
    } else if (node.parent) {
      // Ein Element gehoert zu dem Identifiable, unter dem es haengt.
      const oben = traeger.get(node.parent);
      if (oben) traeger.set(node.nodeId, oben);
    }
  }

  /** Kanten werden ueber Quelle, Ziel und Art zusammengefasst und gezaehlt. */
  const gezaehlt = new Map<string, { source: NodeId; target: NodeId; kind: GraphEdgeKind; count: number }>();

  const kante = (source: NodeId, target: NodeId, kind: GraphEdgeKind): void => {
    if (source === target && kind === "semanticId") return;
    const schluessel = `${kind}:${source}:${target}`;
    const vorhanden = gezaehlt.get(schluessel);
    if (vorhanden) vorhanden.count += 1;
    else gezaehlt.set(schluessel, { source, target, kind, count: 1 });
  };

  /** Loest eine Reference auf einen Graph-Knoten auf, sofern er in der Umgebung liegt. */
  const ziel = (reference: JsonValue | undefined): NodeId | null => {
    const target = referenceTarget(reference);
    if (target) {
      const direkt = byAasId.get(target);
      if (direkt) return direkt;
    }
    // Eine ModelReference kann ueber mehrere Keys gehen. Der erste, der auf ein
    // Identifiable in dieser Umgebung zeigt, gewinnt.
    if (isJsonObject(reference)) {
      const keys = reference["keys"];
      if (isJsonArray(keys)) {
        for (const key of keys) {
          if (!isJsonObject(key)) continue;
          const wert = key["value"];
          if (typeof wert !== "string") continue;
          const treffer = byAasId.get(wert);
          if (treffer) return treffer;
        }
      }
    }
    return null;
  };

  for (const node of walk(model)) {
    const oben = traeger.get(node.nodeId);
    if (!oben) continue;

    if (node.kind === "AssetAdministrationShell") {
      const submodels = node.data["submodels"];
      if (isJsonArray(submodels)) {
        for (const verweis of submodels) {
          const t = ziel(verweis);
          if (t) kante(node.nodeId, t, "submodel");
        }
      }
      const derivedFrom = ziel(node.data["derivedFrom"]);
      if (derivedFrom) kante(node.nodeId, derivedFrom, "derivedFrom");
    }

    // semanticId zaehlt fuer den tragenden Identifiable, egal wie tief das Element liegt.
    const semantisch = ziel(node.data["semanticId"]);
    if (semantisch) kante(oben, semantisch, "semanticId");

    if (node.kind === "RelationshipElement" || node.kind === "AnnotatedRelationshipElement") {
      for (const feld of ["first", "second"] as const) {
        const t = ziel(node.data[feld]);
        if (t && t !== oben) kante(oben, t, "relationship");
      }
    }

    if (node.kind === "ReferenceElement") {
      const t = ziel(node.data["value"]);
      if (t && t !== oben) kante(oben, t, "reference");
    }
  }

  const edges: GraphEdge[] = [...gezaehlt.entries()].map(([schluessel, eintrag]) => ({
    id: schluessel,
    source: eintrag.source,
    target: eintrag.target,
    kind: eintrag.kind,
    count: eintrag.count,
  }));

  return { nodes, edges };
}

/**
 * Schneidet den Graphen auf die Nachbarschaft eines Knotens zu.
 *
 * Die Grenze aus dem Plan fuer sehr grosse Modelle. Richtungslos: wer auf den Knoten
 * zeigt, gehoert genauso zur Nachbarschaft wie das, worauf er zeigt.
 */
export function neighborhood(graph: Graph, nodeId: NodeId, depth = 1): Graph {
  if (!graph.nodes.some((node) => node.id === nodeId)) return { nodes: [], edges: [] };

  const drin = new Set<NodeId>([nodeId]);
  let rand = new Set<NodeId>([nodeId]);

  for (let schritt = 0; schritt < depth; schritt += 1) {
    const naechster = new Set<NodeId>();
    for (const edge of graph.edges) {
      if (rand.has(edge.source) && !drin.has(edge.target)) naechster.add(edge.target);
      if (rand.has(edge.target) && !drin.has(edge.source)) naechster.add(edge.source);
    }
    if (naechster.size === 0) break;
    for (const id of naechster) drin.add(id);
    rand = naechster;
  }

  return {
    nodes: graph.nodes.filter((node) => drin.has(node.id)),
    edges: graph.edges.filter((edge) => drin.has(edge.source) && drin.has(edge.target)),
  };
}

/** Ab wann die Karte ohne Beschneidung unuebersichtlich wird. */
export const GRAPH_LIMIT = 150;

export interface LaidOutNode extends GraphNode {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LayoutResult {
  readonly nodes: readonly LaidOutNode[];
  readonly width: number;
  readonly height: number;
  /** Wie lange elkjs gerechnet hat, in Millisekunden. Fuer die Abnahme. */
  readonly durationMs: number;
}

/**
 * Masse eines Knotens im Layout. Muessen zur Darstellung passen, sonst legen sich Kanten
 * ueber die Karten.
 *
 * Zwei Groessen, weil die Karte eines Identifiable drei Zeilen traegt (Typ und Name,
 * Kennung, Bestand) und die einer ConceptDescription nur zwei.
 */
export const NODE_SIZE: Record<GraphNodeKind, { readonly width: number; readonly height: number }> =
  {
    AssetAdministrationShell: { width: 240, height: 74 },
    Submodel: { width: 240, height: 74 },
    ConceptDescription: { width: 200, height: 46 },
  };

export function nodeSize(kind: GraphNodeKind): { readonly width: number; readonly height: number } {
  return NODE_SIZE[kind];
}
