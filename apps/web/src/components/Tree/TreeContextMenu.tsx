import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { canContain, childSlotsOf, SUBMODEL_ELEMENT_KINDS } from "@aas-editor/core";
import { Copy, Plus, Trash2 } from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useEditor } from "@/store/editor";
import type { TreeRow } from "@/store/rows";

/**
 * Kontextmenue des Baums.
 *
 * Ein einziges Menue fuer den ganzen Baum, nicht eines je Zeile: bei tausenden Zeilen
 * waere das sonst tausendfacher Aufwand. Welche Zeile gemeint ist, steht in der Auswahl,
 * die der Rechtsklick vorher setzt.
 *
 * Angeboten wird nur, was `canContain` erlaubt, damit eine ungueltige Struktur gar nicht
 * erst entstehen kann.
 */

const ENVIRONMENT_KINDS: Record<string, string> = {
  assetAdministrationShells: "AssetAdministrationShell",
  submodels: "Submodel",
  conceptDescriptions: "ConceptDescription",
};

export interface TreeContextMenuProps {
  readonly row: TreeRow | null;
  readonly children: ReactNode;
  readonly onAdd: (parentId: string, slot: string, kind: string) => void;
  readonly onDuplicate: (nodeId: string) => void;
  readonly onDelete: (row: TreeRow) => void;
}

export function TreeContextMenu({
  row,
  children,
  onAdd,
  onDuplicate,
  onDelete,
}: TreeContextMenuProps) {
  const { t } = useTranslation();
  const model = useEditor((state) => state.model);
  const node = row && model ? model.nodes[row.nodeId] : undefined;

  const slots = node
    ? childSlotsOf(node.kind).map((slot) => ({
        name: slot.name,
        kinds:
          node.kind === "Environment"
            ? [ENVIRONMENT_KINDS[slot.name]].filter((kind): kind is string => Boolean(kind))
            : SUBMODEL_ELEMENT_KINDS.filter((kind) =>
                canContain(node.kind, slot.name, kind, node.data),
              ),
      }))
    : [];

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        {node ? (
          <>
            <ContextMenuGroup>
              {slots.map((slot) =>
                slot.kinds.length === 0 ? null : (
                  <ContextMenuSub key={slot.name}>
                    <ContextMenuSubTrigger>
                      <Plus data-icon="inline-start" />
                      {t("baum.neuIn", { slot: slot.name })}
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="max-h-80 overflow-auto">
                      <ContextMenuGroup>
                        {slot.kinds.map((kind) => (
                          <ContextMenuItem
                            key={kind}
                            onSelect={() => onAdd(row!.nodeId, slot.name, kind)}
                          >
                            {kind}
                          </ContextMenuItem>
                        ))}
                      </ContextMenuGroup>
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                ),
              )}
            </ContextMenuGroup>

            {row?.parentId ? (
              <>
                <ContextMenuSeparator />
                <ContextMenuGroup>
                  <ContextMenuItem onSelect={() => onDuplicate(row.nodeId)}>
                    <Copy data-icon="inline-start" />
                    {t("baum.duplizieren")}
                  </ContextMenuItem>
                  <ContextMenuItem variant="destructive" onSelect={() => onDelete(row)}>
                    <Trash2 data-icon="inline-start" />
                    {t("baum.loeschen")}
                  </ContextMenuItem>
                </ContextMenuGroup>
              </>
            ) : null}
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
