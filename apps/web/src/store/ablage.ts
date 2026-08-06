import { canContain, childSlotsOf, isAncestor, type EditorModel } from "@aas-editor/core";

import { slotVonOrdner, type TreeRow } from "./rows";

/**
 * Wohin faellt ein gezogener Knoten?
 *
 * Reine Rechnung, ohne React und ohne Speicher: bis zum 06.08.2026 stand sie mitten in
 * `Tree.tsx` und war damit nicht pruefbar, ohne den halben Editor zu laden. Genau hier
 * steckte der Fehler, dass Submodels sich nicht mehr umsortieren liessen.
 */

export type DropWhere = "into" | "before" | "after";

export interface DropTarget {
  readonly parentId: string;
  readonly slot: string;
  readonly index: number | undefined;
  readonly where: DropWhere;
  /**
   * Gesetzt, wenn nicht ein Knoten umhaengt, sondern die Verweisliste einer Shell
   * umgeordnet wird. Dann zaehlt `index` in der aufgeloesten Liste, so wie der Baum sie
   * zeigt, und `parentId` ist die Shell.
   */
  readonly verweis?: boolean;
}

/**
 * Wohin faellt der gezogene Knoten? Das obere und untere Viertel der Zeile bedeuten
 * "davor" beziehungsweise "danach" unter demselben Elternteil, die Mitte "hinein".
 * Abgelegt wird nur, wo `canContain` es erlaubt.
 */
export function dropTarget(
  model: EditorModel,
  draggedId: string,
  row: TreeRow,
  event: React.DragEvent,
  quelle: TreeRow | undefined,
): DropTarget | null {
  const dragged = model.nodes[draggedId];
  if (!dragged || draggedId === row.nodeId) return null;
  if (isAncestor(model, draggedId, row.nodeId)) return null;

  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const ratio = (event.clientY - bounds.top) / bounds.height;

  // Eine Ordnerzeile **ist** ein Slot des Environments. Abgelegt wird dort hinein, nicht
  // daneben: der Ordner selbst hat kein Geschwister, neben das etwas passte.
  if (row.ordner && row.slot) {
    const wurzel = model.nodes[model.rootId];
    if (!wurzel || !canContain(wurzel.kind, row.slot, dragged.kind, wurzel.data)) return null;
    return { parentId: model.rootId, slot: row.slot, index: undefined, where: "into" };
  }

  const target = model.nodes[row.nodeId];
  if (!target) return null;

  // Mitte: hinein, in den ersten passenden Slot.
  if (ratio > 0.25 && ratio < 0.75) {
    const slot = childSlotsOf(target.kind)
      .map((entry) => entry.name)
      .find((name) => canContain(target.kind, name, dragged.kind, target.data));
    if (slot) return { parentId: row.nodeId, slot, index: undefined, where: "into" };
  }

  // Rand: als Geschwister davor oder danach.
  if (row.parentId && row.slot) {
    const parent = model.nodes[row.parentId];

    /*
     * Submodels unter einer Shell sind Verweise, keine Kinder: `canContain` sagt hier
     * nein, und bis zum 06.08.2026 endete der Zug damit im Nichts. Umgeordnet wird
     * stattdessen die Verweisliste. Nur innerhalb **derselben** Shell: ein Zug auf eine
     * andere Shell waere ein Umhaengen des Verweises und damit eine andere Aussage.
     */
    if (
      parent?.kind === "AssetAdministrationShell" &&
      row.slot === "submodels" &&
      dragged.kind === "Submodel" &&
      quelle?.parentId === row.parentId
    ) {
      const after = ratio >= 0.5;
      return {
        parentId: row.parentId,
        slot: row.slot,
        index: row.index + (after ? 1 : 0),
        where: after ? "after" : "before",
        verweis: true,
      };
    }

    if (parent && canContain(parent.kind, row.slot, dragged.kind, parent.data)) {
      const after = ratio >= 0.5;
      return {
        parentId: row.parentId,
        slot: row.slot,
        index: row.index + (after ? 1 : 0),
        where: after ? "after" : "before",
      };
    }
  }

  return null;
}

export interface Einfuegeziel {
  /** Der Knoten, unter dem etwas entsteht. Bei einer Ordnerzeile die Wurzel. */
  readonly parentId: string;
  /**
   * Der Slot, wenn die Zeile ihn vorgibt. Eine Ordnerzeile **ist** ein Slot des
   * Environments, dort gibt es keine Wahl. Sonst null, dann entscheidet der Typ.
   */
  readonly festerSlot: string | null;
}

/**
 * Worauf zeigt eine Baumzeile, wenn man dort etwas anlegen oder einfuegen will?
 *
 * Ordnerzeilen sind keine Modellknoten: sie tragen die Kennung `slot:<name>`, und ein
 * Nachschlagen in `model.nodes` liefert nichts. Bis zum 06.08.2026 fiel damit das ganze
 * Kontextmenue leer aus, und ausgerechnet auf "ConceptDescriptions" liess sich keine
 * ConceptDescription anlegen. Dieselbe Umrechnung macht `dropTarget` fuer die Ablage;
 * sie steht deshalb hier, damit beide Wege dasselbe Ziel meinen.
 */
export function zielVon(model: EditorModel, nodeId: string): Einfuegeziel | null {
  const slot = slotVonOrdner(nodeId);
  if (slot !== null) return { parentId: model.rootId, festerSlot: slot };
  return model.nodes[nodeId] ? { parentId: nodeId, festerSlot: null } : null;
}
