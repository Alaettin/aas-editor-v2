import { memo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { isIdentifiableKind } from "@aas-editor/core";

import { Chip } from "@/components/ui/chip";
import { CountBadge } from "@/components/ui/count-badge";
import { TypeDot } from "@/components/ui/type-dot";
import { toneOf } from "@/lib/typeOf";
import { cn } from "@/lib/utils";
import { type TreeRow as Row } from "@/store/rows";
import { useTranslation } from "react-i18next";

/**
 * Eine Baumzeile. Bewusst `memo`: beim Scrollen durch ein Modell mit tausenden
 * Elementen darf nur die tatsaechlich veraenderte Zeile neu rendern.
 *
 * Statt Typ-Badges auf jeder Zeile steht links ein Typpunkt: gefuellt und eckig fuer
 * Identifiables, umrandet und rund fuer SubmodelElements. Bei mehreren tausend Zeilen ist
 * ein Wort je Zeile Laerm, ein Punkt nicht.
 */

export interface TreeRowProps {
  readonly row: Row;
  readonly selected: boolean;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly dropHint: "none" | "into" | "before" | "after";
  readonly onSelect: (nodeId: string) => void;
  readonly onToggle: (nodeId: string) => void;
  readonly onDragStart: (nodeId: string, event: React.DragEvent) => void;
  readonly onDragOver: (row: Row, event: React.DragEvent) => void;
  readonly onDrop: (row: Row, event: React.DragEvent) => void;
  readonly onDragEnd: () => void;
  readonly onContextMenu: (row: Row) => void;
}

export const TreeRowView = memo(function TreeRowView({
  row,
  selected,
  errorCount,
  warningCount,
  dropHint,
  onSelect,
  onToggle,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onContextMenu,
}: TreeRowProps) {
  const { t } = useTranslation();
  const befund = errorCount > 0 || warningCount > 0;
  const tone = toneOf(row.kind);

  return (
    <div
      // Die Kennung braucht der Behaelter fuer `aria-activedescendant`: die Zeilen selbst
      // sind nicht fokussierbar, die Auswahl wandert per Pfeiltaste.
      id={`baumzeile-${row.nodeId}`}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-posinset={row.posinset}
      aria-setsize={row.setsize}
      aria-selected={selected}
      aria-expanded={row.hasChildren ? row.expanded : undefined}
      data-node-id={row.nodeId}
      data-selected={selected || undefined}
      draggable={row.parentId !== null}
      onDragStart={(event) => onDragStart(row.nodeId, event)}
      onDragOver={(event) => onDragOver(row, event)}
      onDrop={(event) => onDrop(row, event)}
      onDragEnd={onDragEnd}
      onContextMenu={() => onContextMenu(row)}
      onClick={() => onSelect(row.nodeId)}
      className={cn(
        "flex h-(--row-height) cursor-default items-stretch gap-1.5 rounded-md pr-2 text-base select-none",
        "transition-colors duration-(--duration-quick)",
        selected
          ? "bg-selected text-selected-foreground shadow-[inset_2px_0_0_var(--primary)]"
          : "hover:bg-accent",
        dropHint === "into" && "ring-2 ring-ring ring-inset",
        dropHint === "before" && "border-t-2 border-t-primary",
        dropHint === "after" && "border-b-2 border-b-primary",
      )}
    >
      {/* Einrueckungsfuehrung, siehe tokens.css. Ein Element je Zeile, unabhaengig von der Tiefe. */}
      <span
        aria-hidden
        data-tree-guides
        className="shrink-0 self-stretch"
        style={{ width: `calc(${row.depth} * var(--tree-indent))` }}
      />

      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {row.hasChildren ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={row.expanded ? t("baum.zuklappen") : t("baum.aufklappen")}
            className="flex size-4 shrink-0 items-center justify-center rounded-xs text-foreground-faint hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(row.nodeId);
            }}
          >
            {row.expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}

        {/* Gefuellt heisst Identifiable, umrandet heisst SubmodelElement. */}
        <TypeDot
          tone={befund ? "warn" : tone}
          variant={isIdentifiableKind(row.kind) || row.parentId === null ? "filled" : "outline"}
        />

        <span
          className={cn(
            "truncate",
            (selected || row.hasChildren) && "font-medium",
            row.matched && "font-medium text-primary",
          )}
        >
          {row.label}
        </span>

        {row.disambiguator ? (
          <Chip tone="warn" mono title={t("baum.gleicherIdShort")}>
            {row.disambiguator}
          </Chip>
        ) : null}

        {row.childCount > 0 ? <CountBadge value={row.childCount} /> : null}

        <span className={cn("flex shrink-0 items-center gap-1", row.childCount === 0 && "ml-auto")}>
          {errorCount > 0 ? (
            <Chip
              tone="warn"
              fill="solid"
              pill
              data-numeric
              title={t("status.constraints", { count: errorCount })}
            >
              {errorCount}
            </Chip>
          ) : null}
          {warningCount > 0 ? (
            <Chip tone="warn" data-numeric title={t("status.warnungen", { count: warningCount })}>
              {warningCount}
            </Chip>
          ) : null}
        </span>
      </span>
    </div>
  );
});
