import { memo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { shortenMiddle, type TreeRow as Row } from "@/store/rows";

/**
 * Eine Baumzeile. Bewusst `memo`: beim Scrollen durch ein Modell mit tausenden
 * Elementen darf nur die tatsaechlich veraenderte Zeile neu rendern.
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
  return (
    <div
      role="treeitem"
      aria-level={row.depth + 1}
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
        "flex h-(--row-height) cursor-default items-center gap-1.5 rounded-sm pr-2 text-sm select-none",
        "transition-colors duration-(--duration-quick)",
        selected ? "bg-selected text-selected-foreground" : "hover:bg-accent",
        dropHint === "into" && "ring-2 ring-ring ring-inset",
        dropHint === "before" && "border-t-2 border-t-primary",
        dropHint === "after" && "border-b-2 border-b-primary",
      )}
      style={{ paddingLeft: `calc(${row.depth} * var(--tree-indent) + 0.25rem)` }}
    >
      {row.hasChildren ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={row.expanded ? "Zuklappen" : "Aufklappen"}
          className="flex size-4 shrink-0 items-center justify-center rounded-xs text-muted-foreground hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            onToggle(row.nodeId);
          }}
        >
          {row.expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
      ) : (
        <span className="size-4 shrink-0" />
      )}

      <span className="truncate">{row.label}</span>

      <span className="shrink-0 rounded-xs bg-muted px-1 py-px text-2xs text-muted-foreground">
        {row.kind}
      </span>

      {row.id ? (
        <span className="truncate font-mono text-2xs text-muted-foreground/70" title={row.id}>
          {shortenMiddle(row.id, 36)}
        </span>
      ) : null}

      <span className="ml-auto flex shrink-0 items-center gap-1">
        {errorCount > 0 ? (
          <span
            data-numeric
            title={`${errorCount} Constraints`}
            className="rounded-xs bg-destructive-muted px-1 text-2xs text-destructive"
          >
            {errorCount}
          </span>
        ) : null}
        {warningCount > 0 ? (
          <span
            data-numeric
            title={`${warningCount} Warnungen`}
            className="rounded-xs bg-warning-muted px-1 text-2xs text-warning"
          >
            {warningCount}
          </span>
        ) : null}
      </span>
    </div>
  );
});
