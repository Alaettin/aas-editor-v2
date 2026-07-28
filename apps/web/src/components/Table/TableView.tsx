import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { Copy, Plus, Trash2 } from "lucide-react";
import {
  canContain,
  childSlotsOf,
  isJsonObject,
  SUBMODEL_ELEMENT_KINDS,
  type EditorNode,
  type JsonValue,
  type NodeId,
} from "@aas-editor/core";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditor } from "@/store/editor";
import { shortenMiddle } from "@/store/rows";

/**
 * Tabellensicht fuer Massenbearbeitung (Plan Abschnitt 8).
 *
 * Gezeigt werden die Kinder des gewaehlten Behaelters. Ist etwas anderes gewaehlt, wird
 * der naechste Behaelter darueber genommen, damit die Sicht nie leer wirkt.
 *
 * Jede Aenderung laeuft durch dieselben Store-Aktionen wie Baum und Formular, also durch
 * `applyChange`, Undo und den Patch-Kanal zum Worker. Es gibt keinen zweiten Weg ins
 * Modell.
 *
 * Wird ueber React.lazy geladen: TanStack Table sind 27 KB gzip, die im Startbundle
 * nichts zu suchen haben.
 */

interface Zeile {
  readonly node: EditorNode;
  readonly index: number;
}

export default function TableView() {
  const { t } = useTranslation();
  const model = useEditor((state) => state.model);
  const selection = useEditor((state) => state.selection);
  const issues = useEditor((state) => state.issues);
  const select = useEditor((state) => state.select);
  const updateField = useEditor((state) => state.updateField);
  const addElement = useEditor((state) => state.addElement);
  const deleteElement = useEditor((state) => state.deleteElement);
  const duplicateElement = useEditor((state) => state.duplicateElement);

  const [markiert, setMarkiert] = useState<Record<NodeId, true>>({});

  /** Der Behaelter, dessen Kinder die Tabelle zeigt. */
  const behaelter = useMemo(() => {
    if (!model || !selection) return null;
    let current: NodeId | null = selection;
    while (current) {
      const node: EditorNode | undefined = model.nodes[current];
      if (!node) break;
      if (childSlotsOf(node.kind).length > 0 && node.kind !== "Environment") return node;
      current = node.parent;
    }
    return null;
  }, [model, selection]);

  const slot = useMemo(() => {
    if (!behaelter) return null;
    const slots = childSlotsOf(behaelter.kind);
    return slots.find((entry) => (behaelter.children[entry.name]?.length ?? 0) > 0) ?? slots[0] ?? null;
  }, [behaelter]);

  const zeilen = useMemo<Zeile[]>(() => {
    if (!model || !behaelter || !slot) return [];
    return (behaelter.children[slot.name] ?? [])
      .map((id, index) => ({ node: model.nodes[id], index }))
      .filter((eintrag): eintrag is Zeile => eintrag.node !== undefined);
  }, [model, behaelter, slot]);

  /** Befunde je Knoten, damit die Tabelle dieselben Zaehler zeigt wie der Baum. */
  const befunde = useMemo(() => {
    const map = new Map<NodeId, number>();
    for (const issue of issues) {
      if (!issue.nodeId) continue;
      map.set(issue.nodeId, (map.get(issue.nodeId) ?? 0) + 1);
    }
    return map;
  }, [issues]);

  const spalten = useMemo<ColumnDef<Zeile>[]>(
    () => [
      {
        id: "auswahl",
        size: 36,
        header: () => null,
        cell: ({ row }) => (
          <Checkbox
            checked={Boolean(markiert[row.original.node.nodeId])}
            aria-label={t("tabelle.markieren")}
            onCheckedChange={(checked) =>
              setMarkiert((current) => {
                const next = { ...current };
                if (checked === true) next[row.original.node.nodeId] = true;
                else delete next[row.original.node.nodeId];
                return next;
              })
            }
          />
        ),
      },
      {
        id: "idShort",
        header: "idShort",
        cell: ({ row }) => (
          <ZelleText
            node={row.original.node}
            feld="idShort"
            onChange={(wert) => updateField(row.original.node.nodeId, "idShort", wert)}
          />
        ),
      },
      {
        id: "modelType",
        header: "Typ",
        size: 160,
        cell: ({ row }) => (
          <span className="rounded-xs bg-muted px-1 py-px text-2xs text-muted-foreground">
            {row.original.node.kind}
          </span>
        ),
      },
      {
        id: "valueType",
        header: "valueType",
        size: 120,
        cell: ({ row }) => (
          <span className="font-mono text-2xs text-muted-foreground">
            {typeof row.original.node.data["valueType"] === "string"
              ? (row.original.node.data["valueType"] as string)
              : "—"}
          </span>
        ),
      },
      {
        id: "value",
        header: "value",
        cell: ({ row }) => (
          <ZelleText
            node={row.original.node}
            feld="value"
            onChange={(wert) => updateField(row.original.node.nodeId, "value", wert)}
          />
        ),
      },
      {
        id: "semanticId",
        header: "semanticId",
        size: 220,
        cell: ({ row }) => {
          const wert = semanticIdText(row.original.node.data["semanticId"]);
          return (
            <span className="font-mono text-2xs text-muted-foreground" title={wert ?? undefined}>
              {wert ? shortenMiddle(wert, 30) : "—"}
            </span>
          );
        },
      },
      {
        id: "befunde",
        header: "",
        size: 44,
        cell: ({ row }) => {
          const anzahl = befunde.get(row.original.node.nodeId) ?? 0;
          return anzahl > 0 ? (
            <span
              data-numeric
              className="rounded-xs bg-destructive-muted px-1 text-2xs text-destructive"
            >
              {anzahl}
            </span>
          ) : null;
        },
      },
    ],
    [markiert, befunde, t, updateField],
  );

  const table = useReactTable({
    data: zeilen,
    columns: spalten,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (zeile) => zeile.node.nodeId,
  });

  if (!behaelter || !slot) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyTitle>{t("tabelle.keinBehaelter")}</EmptyTitle>
          <EmptyDescription>{t("tabelle.keinBehaelterText")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const markierte = Object.keys(markiert).filter((id) => zeilen.some((z) => z.node.nodeId === id));
  const erlaubteTypen =
    behaelter.kind === "Environment"
      ? []
      : SUBMODEL_ELEMENT_KINDS.filter((kind) =>
          canContain(behaelter.kind, slot.name, kind, behaelter.data),
        );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <span className="truncate text-sm font-medium">
          {typeof behaelter.data["idShort"] === "string" && behaelter.data["idShort"]
            ? (behaelter.data["idShort"] as string)
            : behaelter.kind}
        </span>
        <span className="rounded-xs bg-muted px-1 py-px text-2xs text-muted-foreground">
          {slot.name}
        </span>
        <span className="text-2xs text-muted-foreground" data-numeric>
          {t("tabelle.eintraege", { count: zeilen.length })}
        </span>

        <div className="ml-auto flex items-center gap-1">
          {markierte.length > 0 ? (
            <>
              <span className="text-2xs text-muted-foreground" data-numeric>
                {t("tabelle.markiert", { count: markierte.length })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  for (const id of markierte) duplicateElement(id);
                  setMarkiert({});
                }}
              >
                <Copy data-icon="inline-start" />
                {t("baum.duplizieren")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  for (const id of markierte) deleteElement(id);
                  setMarkiert({});
                }}
              >
                <Trash2 data-icon="inline-start" />
                {t("baum.loeschen")}
              </Button>
            </>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={erlaubteTypen.length === 0}>
                <Plus data-icon="inline-start" />
                {t("baum.neu")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-auto">
              <DropdownMenuGroup>
                {erlaubteTypen.map((kind) => (
                  <DropdownMenuItem
                    key={kind}
                    onSelect={() => addElement(behaelter.nodeId, slot.name, kind)}
                  >
                    {kind}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-background">
            {table.getHeaderGroups().map((gruppe) => (
              <tr key={gruppe.id} className="border-b border-border">
                {gruppe.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.column.columnDef.size }}
                    className="px-2 py-1.5 text-left text-2xs font-medium text-muted-foreground"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                data-table-row={row.original.node.nodeId}
                onClick={() => select(row.original.node.nodeId)}
                className={
                  "border-b border-border/60 " +
                  (row.original.node.nodeId === selection ? "bg-selected" : "hover:bg-accent")
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-2 py-1">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {zeilen.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">{t("tabelle.leer")}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Eine bearbeitbare Zelle. Haelt waehrend des Tippens einen lokalen Zustand und meldet
 * erst beim Verlassen nach oben, genau wie das Formular. Sonst erzeugte jeder Tastendruck
 * einen Patch und eine Worker-Nachricht.
 */
function ZelleText({
  node,
  feld,
  onChange,
}: {
  readonly node: EditorNode;
  readonly feld: string;
  readonly onChange: (wert: JsonValue | undefined) => void;
}) {
  const { t } = useTranslation();
  const wert = node.data[feld];
  const text = typeof wert === "string" ? wert : "";
  const [entwurf, setEntwurf] = useState(text);

  // Aenderungen von aussen (Undo, Formular, Auswahlwechsel) uebernehmen.
  useEffect(() => setEntwurf(text), [text]);

  // Sprachtexte, Listen und Objekte lassen sich in einer Zelle nicht sinnvoll bearbeiten.
  if (wert !== undefined && typeof wert !== "string") {
    return <span className="text-2xs text-muted-foreground">{t("tabelle.imFormular")}</span>;
  }

  return (
    <Input
      data-table-cell={feld}
      value={entwurf}
      onChange={(event) => setEntwurf(event.target.value)}
      onBlur={() => {
        if (entwurf !== text) onChange(entwurf === "" ? undefined : entwurf);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setEntwurf(text);
          event.currentTarget.blur();
        }
      }}
      className="h-6 border-0 bg-transparent px-1 shadow-none focus-visible:bg-background focus-visible:ring-1"
    />
  );
}

function semanticIdText(reference: JsonValue | undefined): string | null {
  if (!isJsonObject(reference)) return null;
  const keys = reference["keys"];
  if (!Array.isArray(keys) || keys.length === 0) return null;
  const first = keys[0];
  if (!isJsonObject(first)) return null;
  const wert = first["value"];
  return typeof wert === "string" && wert ? wert : null;
}
