import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { canContain, childSlotsOf, isAncestor, SUBMODEL_ELEMENT_KINDS } from "@aas-editor/core";

import { ChevronsDownUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { useCssPx } from "@/lib/useCssPx";
import { buildCensus } from "@/store/census";
import { useEditor } from "@/store/editor";
import { buildIssueCounts } from "@/store/issueCounts";
import { buildRows, indexRows, type TreeRow } from "@/store/rows";
import { TreeRowView } from "./TreeRow";
import { TreeContextMenu } from "./TreeContextMenu";
import { TreeFilter } from "./TreeFilter";

/**
 * Der virtualisierte Baum.
 *
 * Vollstaendig ueber die Tastatur bedienbar (Plan Abschnitt 8):
 *   Hoch und Runter    Auswahl bewegen
 *   Rechts             aufklappen, sonst zum ersten Kind
 *   Links              zuklappen, sonst zum Elternteil
 *   Pos1 und Ende      erste und letzte sichtbare Zeile
 *   Entf               loeschen, mit Rueckfrage
 *   Strg+D             duplizieren
 *   F2 oder Enter      idShort im Formular fokussieren
 */

const ROW_OVERSCAN = 12;

export function Tree() {
  const { t } = useTranslation();
  const model = useEditor((state) => state.model);
  const expanded = useEditor((state) => state.expanded);
  const selection = useEditor((state) => state.selection);
  const issues = useEditor((state) => state.issues);
  const filter = useEditor((state) => state.filter);
  const clipboard = useEditor((state) => state.clipboard);

  const select = useEditor((state) => state.select);
  const toggleExpanded = useEditor((state) => state.toggleExpanded);
  const setExpanded = useEditor((state) => state.setExpanded);
  const duplicateElement = useEditor((state) => state.duplicateElement);
  const moveElement = useEditor((state) => state.moveElement);
  const addElement = useEditor((state) => state.addElement);
  const copyNode = useEditor((state) => state.copyNode);
  const cutNode = useEditor((state) => state.cutNode);

  const expandAll = useEditor((state) => state.expandAll);
  const requestDelete = useEditor((state) => state.requestDelete);
  const requestPaste = useEditor((state) => state.requestPaste);

  const parentRef = useRef<HTMLDivElement>(null);
  const [menuRow, setMenuRow] = useState<TreeRow | null>(null);
  const [drag, setDrag] = useState<{
    nodeId: string;
    over: string | null;
    where: DropWhere;
  } | null>(null);

  const rows = useMemo(
    () => (model ? buildRows(model, expanded, filter) : []),
    [model, expanded, filter],
  );
  const rowIndex = useMemo(() => indexRows(rows), [rows]);

  /** Fehler- und Warnungszaehler je Knoten, inklusive aller Elternknoten. */
  const counts = useMemo(() => buildIssueCounts(model, issues), [issues, model]);

  const zensus = useMemo(() => buildCensus(model), [model]);

  // Die Zeilenhoehe steht in tokens.css und haengt an der Dichte. Sie hier zu wiederholen
  // hiesse, sie bei jedem Dichtewechsel aus dem Takt laufen zu lassen.
  const rowHeight = useCssPx("--row-height", 27);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: ROW_OVERSCAN,
    getItemKey: (index) => rows[index]?.nodeId ?? index,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, virtualizer]);

  // Die Auswahl im Blick behalten, auch wenn sie ueber die Tastatur wandert.
  useEffect(() => {
    if (!selection) return;
    const index = rowIndex.get(selection);
    if (index !== undefined) virtualizer.scrollToIndex(index, { align: "auto" });
  }, [selection, rowIndex, virtualizer]);

  const move = useCallback(
    (delta: number) => {
      if (!selection) {
        if (rows[0]) select(rows[0].nodeId);
        return;
      }
      const at = rowIndex.get(selection);
      if (at === undefined) return;
      const next = rows[Math.min(Math.max(at + delta, 0), rows.length - 1)];
      if (next) select(next.nodeId);
    },
    [rows, rowIndex, selection, select],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!model || !selection) return;
      const row = rows[rowIndex.get(selection) ?? -1];
      if (!row) return;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          move(1);
          break;
        case "ArrowUp":
          event.preventDefault();
          move(-1);
          break;
        case "ArrowRight":
          event.preventDefault();
          if (row.hasChildren && !row.expanded) setExpanded(row.nodeId, true);
          else move(1);
          break;
        case "ArrowLeft":
          event.preventDefault();
          if (row.hasChildren && row.expanded) setExpanded(row.nodeId, false);
          else if (row.parentId) select(row.parentId);
          break;
        case "Home":
          event.preventDefault();
          if (rows[0]) select(rows[0].nodeId);
          break;
        case "End":
          event.preventDefault();
          if (rows.at(-1)) select(rows.at(-1)!.nodeId);
          break;
        case "Delete":
          event.preventDefault();
          if (row.parentId) requestDelete([row.nodeId]);
          break;
        case "d":
        case "D":
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            if (row.parentId) duplicateElement(row.nodeId);
          }
          break;
        case "c":
        case "C":
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            if (row.parentId) copyNode(row.nodeId);
          }
          break;
        case "x":
        case "X":
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            if (row.parentId) cutNode(row.nodeId);
          }
          break;
        case "v":
        case "V":
          if ((event.ctrlKey || event.metaKey) && clipboard) {
            event.preventDefault();
            requestPaste(row.nodeId);
          }
          break;
        case "F2":
        case "Enter":
          event.preventDefault();
          document.querySelector<HTMLInputElement>('[data-field="idShort"]')?.focus();
          break;
        default:
          break;
      }
    },
    [
      model,
      rows,
      rowIndex,
      selection,
      move,
      setExpanded,
      select,
      duplicateElement,
      copyNode,
      cutNode,
      clipboard,
    ],
  );

  // --- Drag and drop, nativ ---------------------------------------------------------

  const onDragStart = useCallback((nodeId: string, event: React.DragEvent) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-aas-node", nodeId);
    setDrag({ nodeId, over: null, where: "into" });
  }, []);

  const onDragOver = useCallback(
    (row: TreeRow, event: React.DragEvent) => {
      if (!drag || !model) return;
      const target = dropTarget(model, drag.nodeId, row, event);
      if (!target) return;

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDrag((current) =>
        current && (current.over !== row.nodeId || current.where !== target.where)
          ? { ...current, over: row.nodeId, where: target.where }
          : current,
      );
    },
    [drag, model],
  );

  const onDrop = useCallback(
    (row: TreeRow, event: React.DragEvent) => {
      if (!drag || !model) return;
      const target = dropTarget(model, drag.nodeId, row, event);
      setDrag(null);
      if (!target) return;
      event.preventDefault();
      moveElement(drag.nodeId, target.parentId, target.slot, target.index);
    },
    [drag, model, moveElement],
  );

  const onDragEnd = useCallback(() => setDrag(null), []);

  // Beide Rueckrufe standen frueher als Literale im JSX. Damit bekam jede sichtbare Zeile
  // bei jedem Durchlauf neue Eigenschaften, und das `memo` an TreeRowView war wirkungslos.
  const onContextMenu = useCallback(
    (target: TreeRow) => {
      // Kein preventDefault: Radix soll das Menue oeffnen. Hier wird nur festgehalten,
      // fuer welche Zeile es gilt.
      select(target.nodeId);
      setMenuRow(target);
    },
    [select],
  );

  if (!model) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-(--h-panel-header) shrink-0 items-center px-3">
        <SectionLabel>{t("explorer.titel")}</SectionLabel>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          aria-label={t("menu.allesZuklappen")}
          onClick={() => expandAll(false)}
        >
          <ChevronsDownUp />
        </Button>
      </div>

      <TreeFilter visibleCount={rows.length} />

      <TreeContextMenu
        row={menuRow}
        onAdd={(parentId, slot, kind) => addElement(parentId, slot, kind)}
        onDuplicate={(nodeId) => duplicateElement(nodeId)}
        onDelete={(row) => requestDelete([row.nodeId])}
        onCopy={(nodeId) => copyNode(nodeId)}
        onCut={(nodeId) => cutNode(nodeId)}
        onPaste={(nodeId) => requestPaste(nodeId)}
        canPaste={clipboard !== null}
      >
        <div
          ref={parentRef}
          role="tree"
          aria-label={t("baum.titel")}
          // Ohne diese Zeile erfaehrt ein Bildschirmleser nichts davon, dass die
          // Pfeiltasten die Auswahl bewegen: die Zeilen sind bewusst nicht einzeln
          // fokussierbar, sonst waere der Baum bei zehntausend Elementen ein Tabulator-Feld.
          aria-activedescendant={selection ? `baumzeile-${selection}` : undefined}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="h-full flex-1 overflow-auto p-1 outline-none"
        >
          <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              const count = counts.get(row.nodeId);
              return (
                // Kein `measureElement`: die Zeilenhoehe steht fest in `--row-height`, also
                // ist `estimateSize` exakt. Ein ResizeObserver je Zeile waere reine Last,
                // und beim Rollen die teuerste davon. Dichtewechsel deckt `measure()` ab.
                <div
                  key={item.key}
                  // Die Huelle der Virtualisierung traegt keine Bedeutung. Ohne diese Rolle
                  // stuende zwischen `tree` und `treeitem` ein fremdes Element, und der
                  // Baum waere fuer einen Bildschirmleser kein Baum mehr.
                  role="presentation"
                  data-index={item.index}
                  className="absolute top-0 left-0 w-full"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <TreeRowView
                    row={row}
                    selected={row.nodeId === selection}
                    errorCount={count?.errors ?? 0}
                    warningCount={count?.warnings ?? 0}
                    dropHint={drag?.over === row.nodeId ? drag.where : "none"}
                    onSelect={select}
                    onToggle={toggleExpanded}
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onDragEnd={onDragEnd}
                    onContextMenu={onContextMenu}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </TreeContextMenu>

      {/* Typzensus: die erste Frage an eine fremde Datei, ohne Scrollen beantwortet. */}
      <div className="flex h-(--h-panel-header) shrink-0 items-center gap-2.5 border-t border-border-subtle px-3 font-mono text-2xs">
        <span className="text-type-aas-text" data-numeric>
          {zensus.AssetAdministrationShell} AAS
        </span>
        <span className="text-type-sm-text" data-numeric>
          {zensus.Submodel} SM
        </span>
        <span className="text-type-cd-text" data-numeric>
          {zensus.ConceptDescription} CD
        </span>
      </div>
    </div>
  );
}

// --- Ablageziel bestimmen -------------------------------------------------------------

type DropWhere = "into" | "before" | "after";

interface DropTarget {
  readonly parentId: string;
  readonly slot: string;
  readonly index: number | undefined;
  readonly where: DropWhere;
}

/**
 * Wohin faellt der gezogene Knoten? Das obere und untere Viertel der Zeile bedeuten
 * "davor" beziehungsweise "danach" unter demselben Elternteil, die Mitte "hinein".
 * Abgelegt wird nur, wo `canContain` es erlaubt.
 */
function dropTarget(
  model: NonNullable<ReturnType<typeof useEditor.getState>["model"]>,
  draggedId: string,
  row: TreeRow,
  event: React.DragEvent,
): DropTarget | null {
  const dragged = model.nodes[draggedId];
  if (!dragged || draggedId === row.nodeId) return null;
  if (isAncestor(model, draggedId, row.nodeId)) return null;

  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const ratio = (event.clientY - bounds.top) / bounds.height;
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

export { SUBMODEL_ELEMENT_KINDS };
