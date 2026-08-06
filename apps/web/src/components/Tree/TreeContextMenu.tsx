import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { canContain, childSlotsOf, SUBMODEL_ELEMENT_KINDS } from "@aas-editor/core";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Clipboard,
  Copy,
  Plus,
  Scissors,
  Trash2,
} from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ersteTasteFuer } from "@/lib/shortcuts";
import { zielVon } from "@/store/ablage";
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
 * erst entstehen kann. Drei Zeilenarten werden dabei unterschieden:
 *
 * - **Ordnerzeile** ("ConceptDescriptions", "Submodels"): kein Modellknoten, sondern ein
 *   Slot des Environments. Dort gibt es Anlegen und Einfuegen, aber kein Kopieren oder
 *   Loeschen: ein Ordner ist kein Element.
 * - **Verwaltungsschale**: hat im Modell keinen Kind-Slot, im Baum haengen ihre
 *   Teilmodelle aber unter ihr. "Teilmodell anlegen" legt beides an, Knoten und Verweis.
 * - **Alles andere**: die Slots des Typs, mit den erlaubten Elementtypen darin.
 */

/** Welcher Identifiable-Typ gehoert in welchen Slot des Environments. */
const ENVIRONMENT_KINDS: Record<string, string> = {
  assetAdministrationShells: "AssetAdministrationShell",
  submodels: "Submodel",
  conceptDescriptions: "ConceptDescription",
};

export interface TreeContextMenuProps {
  readonly row: TreeRow | null;
  readonly children: ReactNode;
  readonly onAdd: (parentId: string, slot: string, kind: string) => void;
  readonly onAddSubmodelToShell: (shellId: string) => void;
  readonly onDuplicate: (nodeId: string) => void;
  readonly onDelete: (row: TreeRow) => void;
  readonly onCopy: (nodeId: string) => void;
  readonly onCut: (nodeId: string) => void;
  readonly onPaste: (nodeId: string) => void;
  readonly onExpandSubtree: (nodeId: string, open: boolean) => void;
  readonly canPaste: boolean;
}

export function TreeContextMenu({
  row,
  children,
  onAdd,
  onAddSubmodelToShell,
  onDuplicate,
  onDelete,
  onCopy,
  onCut,
  onPaste,
  onExpandSubtree,
  canPaste,
}: TreeContextMenuProps) {
  const { t } = useTranslation();
  const model = useEditor((state) => state.model);

  const ziel = row && model ? zielVon(model, row.nodeId) : null;
  const node = ziel && model ? model.nodes[ziel.parentId] : undefined;
  const istOrdner = row?.ordner === true;
  const istShell = node?.kind === "AssetAdministrationShell" && !istOrdner;
  // Die Wurzel und die Ordnerzeilen sind keine Elemente: sie lassen sich nicht kopieren,
  // duplizieren oder loeschen.
  const istElement = row !== null && !istOrdner && row.parentId !== null;

  /**
   * Was laesst sich hier anlegen, je Slot? Bei einer Ordnerzeile gibt der Ordner den Slot
   * vor, es bleibt genau einer.
   */
  const slots =
    node === undefined
      ? []
      : (ziel?.festerSlot !== null && ziel !== null
          ? [{ name: ziel.festerSlot }]
          : childSlotsOf(node.kind)
        )
          .map((slot) => ({
            name: slot.name,
            kinds:
              node.kind === "Environment"
                ? [ENVIRONMENT_KINDS[slot.name]].filter((kind): kind is string => Boolean(kind))
                : SUBMODEL_ELEMENT_KINDS.filter((kind) =>
                    canContain(node.kind, slot.name, kind, node.data),
                  ),
          }))
          .filter((slot) => slot.kinds.length > 0);

  const mehrereSlots = slots.length > 1;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        {row && node ? (
          <>
            {slots.length > 0 || istShell ? (
              <>
                <ContextMenuGroup>
                  {/*
                    Ein Untermenue "Neu", wie am Plus-Knopf der Werkzeugleiste. Bei einer
                    Operation kommen drei Slots mit je vierzehn Typen zusammen; ohne
                    Ueberschriften stuende jeder Name dreimal gleich da, ohne dass man
                    saehe, in welche Liste er gehoert.
                  */}
                  {slots.length > 0 ? (
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>
                        <Plus data-icon="inline-start" />
                        {t("baum.neu")}
                      </ContextMenuSubTrigger>
                      {/*
                        Die Hoehe kommt von Radix, nicht als feste Zahl: bei einer
                        Operation stehen zweiundvierzig Eintraege darin, und ein Menue an
                        einer Zeile weit unten liefe sonst aus dem Fenster. Das
                        Hauptmenue macht es genauso; nur die Basisklasse des Untermenues
                        hatte es nicht.
                      */}
                      <ContextMenuSubContent className="max-h-(--radix-context-menu-content-available-height) w-auto min-w-56 overflow-x-hidden overflow-y-auto">
                        {slots.map((slot) => (
                          <Fragment key={slot.name}>
                            {mehrereSlots ? (
                              <ContextMenuLabel>{t(`slot.${slot.name}`)}</ContextMenuLabel>
                            ) : null}
                            {slot.kinds.map((kind) => (
                              <ContextMenuItem
                                key={`${slot.name}:${kind}`}
                                className="whitespace-nowrap"
                                onSelect={() => onAdd(ziel!.parentId, slot.name, kind)}
                              >
                                {kind}
                              </ContextMenuItem>
                            ))}
                          </Fragment>
                        ))}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                  ) : null}

                  {/*
                    Eine Shell hat im Modell keinen Kind-Slot: ihre Teilmodelle haengen an
                    Verweisen. Der Eintrag legt deshalb beides an.
                  */}
                  {istShell ? (
                    <ContextMenuItem onSelect={() => onAddSubmodelToShell(row.nodeId)}>
                      <Plus data-icon="inline-start" />
                      {t("baum.neuSubmodel")}
                    </ContextMenuItem>
                  ) : null}
                </ContextMenuGroup>
                <ContextMenuSeparator />
              </>
            ) : null}

            <ContextMenuGroup>
              {istElement ? (
                <>
                  <ContextMenuItem onSelect={() => onCopy(row.nodeId)}>
                    <Copy data-icon="inline-start" />
                    {t("baum.kopieren")}
                    <ContextMenuShortcut>{ersteTasteFuer("hilfe.kopieren")}</ContextMenuShortcut>
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => onCut(row.nodeId)}>
                    <Scissors data-icon="inline-start" />
                    {t("baum.ausschneiden")}
                    <ContextMenuShortcut>
                      {ersteTasteFuer("hilfe.ausschneiden")}
                    </ContextMenuShortcut>
                  </ContextMenuItem>
                </>
              ) : null}
              <ContextMenuItem disabled={!canPaste} onSelect={() => onPaste(row.nodeId)}>
                <Clipboard data-icon="inline-start" />
                {t("baum.einfuegen")}
                <ContextMenuShortcut>{ersteTasteFuer("hilfe.einfuegen")}</ContextMenuShortcut>
              </ContextMenuItem>
            </ContextMenuGroup>

            {row.hasChildren ? (
              <>
                <ContextMenuSeparator />
                <ContextMenuGroup>
                  <ContextMenuItem onSelect={() => onExpandSubtree(row.nodeId, true)}>
                    <ChevronsUpDown data-icon="inline-start" />
                    {t("baum.teilbaumAufklappen")}
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => onExpandSubtree(row.nodeId, false)}>
                    <ChevronsDownUp data-icon="inline-start" />
                    {t("baum.teilbaumZuklappen")}
                  </ContextMenuItem>
                </ContextMenuGroup>
              </>
            ) : null}

            {istElement ? (
              <>
                <ContextMenuSeparator />
                <ContextMenuGroup>
                  <ContextMenuItem onSelect={() => onDuplicate(row.nodeId)}>
                    <Copy data-icon="inline-start" />
                    {t("baum.duplizieren")}
                    <ContextMenuShortcut>{ersteTasteFuer("hilfe.duplizieren")}</ContextMenuShortcut>
                  </ContextMenuItem>
                  <ContextMenuItem variant="destructive" onSelect={() => onDelete(row)}>
                    <Trash2 data-icon="inline-start" />
                    {t("baum.loeschen")}
                    <ContextMenuShortcut>{ersteTasteFuer("hilfe.loeschen")}</ContextMenuShortcut>
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
