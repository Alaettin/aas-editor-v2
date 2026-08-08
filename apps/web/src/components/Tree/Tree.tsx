import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { SUBMODEL_ELEMENT_KINDS } from "@aas-editor/core";

import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { useCssPx } from "@/lib/useCssPx";
import { buildCensus } from "@/store/census";
import { useEditor } from "@/store/editor";
import { buildIssueCounts } from "@/store/issueCounts";
import { dropTarget, type DropWhere } from "@/store/ablage";
import { buildRows, indexRows, pathTo, slotVonOrdner, type TreeRow } from "@/store/rows";
import type { NodeId } from "@aas-editor/core";
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
  const moveSubmodelUnderShell = useEditor((state) => state.moveSubmodelUnderShell);
  const addElement = useEditor((state) => state.addElement);
  const addSubmodelToShell = useEditor((state) => state.addSubmodelToShell);
  const copyNode = useEditor((state) => state.copyNode);
  const cutNode = useEditor((state) => state.cutNode);

  const expandAll = useEditor((state) => state.expandAll);
  const expandSubtree = useEditor((state) => state.expandSubtree);
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

  /** Steht schon jede Zeile mit Kindern offen? Danach richtet sich der Umschalter oben. */
  const allesOffen = rows.every((row) => !row.hasChildren || row.expanded);

  /**
   * Der Pfad zur Auswahl, in derselben Rechnung wie im Formular. Er steht ueber dem Baum
   * und nicht nur im Formular, weil man im Graphen sonst nicht weiss, wo man ist.
   */
  const pfad = useMemo(() => {
    if (!model || !selection) return [];
    return pathTo(model, selection).map((id) => {
      const knoten = model.nodes[id];
      const idShort = knoten?.data["idShort"];
      // Ordnerzeilen tragen ihren Slotnamen als Kennung; ohne diese Zeile stuende in der
      // Brotkrume "slot:conceptDescriptions".
      const slot = slotVonOrdner(id);
      if (slot !== null) return { nodeId: id, label: t(`slot.${slot}`) };
      return {
        nodeId: id,
        label: typeof idShort === "string" && idShort ? idShort : (knoten?.kind ?? id),
      };
    });
  }, [model, selection, t]);

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
      if (!model) return;
      // Ohne Auswahl reagierte der Baum bisher auf gar keine Taste, obwohl `move()` den
      // Fall "noch nichts gewaehlt" kennt. Der Zweig war damit unerreichbar.
      if (!selection) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home") {
          event.preventDefault();
          if (rows[0]) select(rows[0].nodeId);
        }
        return;
      }
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
          if (row.parentId && !row.ordner) requestDelete([row.nodeId]);
          break;
        case "d":
        case "D":
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            if (row.parentId && !row.ordner) duplicateElement(row.nodeId);
          }
          break;
        case "c":
        case "C":
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            if (row.parentId && !row.ordner) copyNode(row.nodeId);
          }
          break;
        case "x":
        case "X":
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            if (row.parentId && !row.ordner) cutNode(row.nodeId);
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

  /** Die Zeile zu einer Kennung. Der Zug braucht sie, um Herkunft und Ziel zu vergleichen. */
  const zeileVon = useCallback(
    (nodeId: string) => {
      const stelle = rowIndex.get(nodeId as NodeId);
      return stelle === undefined ? undefined : rows[stelle];
    },
    [rowIndex, rows],
  );

  const onDragStart = useCallback((nodeId: string, event: React.DragEvent) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-aas-node", nodeId);
    setDrag({ nodeId, over: null, where: "into" });
  }, []);

  const onDragOver = useCallback(
    (row: TreeRow, event: React.DragEvent) => {
      if (!drag || !model) return;
      const target = dropTarget(model, drag.nodeId, row, event, zeileVon(drag.nodeId));
      if (!target) return;

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDrag((current) =>
        current && (current.over !== row.nodeId || current.where !== target.where)
          ? { ...current, over: row.nodeId, where: target.where }
          : current,
      );
    },
    [drag, model, zeileVon],
  );

  const onDrop = useCallback(
    (row: TreeRow, event: React.DragEvent) => {
      if (!drag || !model) return;
      const target = dropTarget(model, drag.nodeId, row, event, zeileVon(drag.nodeId));
      setDrag(null);
      if (!target) return;
      event.preventDefault();
      if (target.verweis) {
        moveSubmodelUnderShell(target.parentId, drag.nodeId, target.index ?? 0);
      } else {
        moveElement(drag.nodeId, target.parentId, target.slot, target.index);
      }
    },
    [drag, model, moveElement, moveSubmodelUnderShell, zeileVon],
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
        {/*
          Ein Umschalter, kein Einbahnknopf: bis zum 06.08.2026 gab es nur "Alles
          zuklappen", und das Gegenstueck stand in einem Menue, das es nicht mehr gibt.
        */}
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          aria-label={allesOffen ? t("menu.allesZuklappen") : t("menu.allesAufklappen")}
          onClick={() => expandAll(!allesOffen)}
        >
          {allesOffen ? <ChevronsDownUp /> : <ChevronsUpDown />}
        </Button>
      </div>

      {/* Typzensus: die erste Frage an eine fremde Datei, ohne Scrollen beantwortet. */}
      <div className="flex shrink-0 items-center gap-3.5 px-3 pb-3 font-mono text-2xs">
        <span className="text-type-aas-text" data-numeric>
          {zensus.AssetAdministrationShell} AAS
        </span>
        <span className="text-type-sm-text" data-numeric>
          {zensus.Submodel} SM
        </span>
        <span className="text-muted-foreground" data-numeric>
          {zensus.SubmodelElement} SME
        </span>
        <span className="text-type-cd-text" data-numeric>
          {zensus.ConceptDescription} CD
        </span>
      </div>

      <TreeFilter visibleCount={rows.length} />

      {/* Wo stehe ich? Im Graphen sagt das sonst nichts. */}
      {pfad.length > 0 ? (
        <nav
          aria-label={t("baum.pfad")}
          className="flex shrink-0 flex-wrap items-center gap-1 px-3 pb-3 font-mono text-3xs text-muted-foreground"
        >
          {pfad.map((eintrag, index) => (
            <span key={eintrag.nodeId} className="flex items-center gap-1">
              {index > 0 ? <span className="text-border">/</span> : null}
              <span
                className={index === pfad.length - 1 ? "truncate text-type-aas-text" : "truncate"}
              >
                {eintrag.label}
              </span>
            </span>
          ))}
        </nav>
      ) : null}

      <TreeContextMenu
        row={menuRow}
        onAdd={(parentId, slot, kind) => addElement(parentId, slot, kind)}
        onAddSubmodelToShell={(shellId) => addSubmodelToShell(shellId)}
        onDuplicate={(nodeId) => duplicateElement(nodeId)}
        onDelete={(row) => requestDelete([row.nodeId])}
        onCopy={(nodeId) => copyNode(nodeId)}
        onCut={(nodeId) => cutNode(nodeId)}
        onPaste={(nodeId) => requestPaste(nodeId)}
        onExpandSubtree={(nodeId, open) => expandSubtree(nodeId, open)}
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

      {/*
        Bis zum 08.08.2026 stand hier ein Fussbereich mit Kuerzel, Abmeldeweg und
        Sprachwahl. Beides sitzt jetzt in der Titelzeile, auf dem Einstieg wie im Editor.
      */}
    </div>
  );
}

export { SUBMODEL_ELEMENT_KINDS };
