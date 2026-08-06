import { isIdentifiableKind } from "./kinds.js";
import { isJsonArray, isJsonObject, type JsonValue } from "./json.js";
import { walk, type EditorModel, type NodeId } from "./store.js";
import { referenceTarget } from "../semantics.js";

/**
 * Referenzen innerhalb einer Umgebung aufloesen.
 *
 * `AssetAdministrationShell.submodels` ist eine Liste von **Verweisen**, kein Kind-Slot.
 * Wer wissen will, welche Submodels zu einer Shell gehoeren, muss diese Verweise gegen die
 * fachlichen `id` der Umgebung halten.
 *
 * Das stand bis zum 06.08.2026 nur in `graph.ts`. Seit der Explorer dieselbe Zuordnung
 * braucht, liegt sie hier: zwei Aufloesungen derselben Referenz wuerden frueher oder
 * spaeter auseinanderlaufen, und dann zeigten Baum und Graph verschiedene Baeume.
 */

export interface Aufloeser {
  /** Fachliche `id` auf Knotenkennung, nur fuer Identifiables dieser Umgebung. */
  readonly byAasId: ReadonlyMap<string, NodeId>;
  /** Der Knoten, auf den eine Reference zeigt, oder null. */
  ziel(reference: JsonValue | undefined): NodeId | null;
}

export function baueAufloeser(model: EditorModel): Aufloeser {
  const byAasId = new Map<string, NodeId>();
  for (const node of walk(model)) {
    if (!isIdentifiableKind(node.kind)) continue;
    const id = node.data["id"];
    if (typeof id === "string") byAasId.set(id, node.nodeId);
  }

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

  return { byAasId, ziel };
}

export interface ShellZuordnung {
  /** Je Shell die Submodels, auf die sie zeigt, in der Reihenfolge ihrer Verweise. */
  readonly jeShell: ReadonlyMap<NodeId, readonly NodeId[]>;
  /** Umgekehrt: welches Submodel haengt an welcher Shell. */
  readonly shellVon: ReadonlyMap<NodeId, NodeId>;
  /** Submodels, auf die keine Shell zeigt. In Modellreihenfolge. */
  readonly frei: readonly NodeId[];
}

/**
 * Welche Submodels gehoeren zu welcher Shell.
 *
 * **Jedes Submodel wird der ersten Shell zugeschlagen, die darauf verweist.** Ein Baum kann
 * eine Zeile nur an einem Ort zeigen, und `indexRows`, `getItemKey` und
 * `aria-activedescendant` setzen alle eine eindeutige Knotenkennung je Zeile voraus. Im
 * Graphen ist das anders, dort bekommt jede Shell ihre eigene Kante.
 */
export function submodelsJeShell(model: EditorModel): ShellZuordnung {
  const { ziel } = baueAufloeser(model);
  const jeShell = new Map<NodeId, NodeId[]>();
  const shellVon = new Map<NodeId, NodeId>();

  const wurzel = model.nodes[model.rootId];
  const shells = wurzel?.children["assetAdministrationShells"] ?? [];

  for (const shellId of shells) {
    const shell = model.nodes[shellId];
    const treffer: NodeId[] = [];
    const verweise = shell?.data["submodels"];
    if (isJsonArray(verweise)) {
      for (const verweis of verweise) {
        const submodelId = ziel(verweis);
        if (!submodelId) continue;
        if (model.nodes[submodelId]?.kind !== "Submodel") continue;
        // Erste Shell gewinnt, und ein doppelter Verweis derselben Shell zaehlt einmal.
        if (shellVon.has(submodelId)) continue;
        shellVon.set(submodelId, shellId);
        treffer.push(submodelId);
      }
    }
    jeShell.set(shellId, treffer);
  }

  const frei = (wurzel?.children["submodels"] ?? []).filter((id) => !shellVon.has(id));
  return { jeShell, shellVon, frei };
}
