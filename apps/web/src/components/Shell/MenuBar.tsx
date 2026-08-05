import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { canContain, childSlotsOf, SUBMODEL_ELEMENT_KINDS } from "@aas-editor/core";

import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { SaveChip } from "./SaveChip";
import { useEditor, type View } from "@/store/editor";
import { ersteTasteFuer } from "@/lib/shortcuts";
import { useAnsicht, type Density, type Theme } from "@/store/ansicht";

/**
 * Die Menuezeile. Jeder Eintrag hat eine Aktion, es gibt keinen toten Punkt.
 *
 * Was hier steht, kommt ohne Ausnahme aus vorhandenen Store-Aktionen oder aus den drei
 * Rueckrufen, die nur die Huelle kennt (Datei oeffnen, Exportieren, Versionen).
 */

interface Props {
  readonly onOeffnen: () => void;
  readonly onExport: (format: "json" | "xml" | "aasx") => void;
  readonly onVersionen: () => void;
  readonly onPalette: () => void;
  readonly onEinstellungen: () => void;
  readonly onTastaturwege: () => void;
  readonly onUeber: () => void;
}

export function MenuBar({
  onOeffnen,
  onExport,
  onVersionen,
  onPalette,
  onEinstellungen,
  onTastaturwege,
  onUeber,
}: Props) {
  const { t } = useTranslation();

  const model = useEditor((state) => state.model);
  const meta = useEditor((state) => state.meta);
  const selection = useEditor((state) => state.selection);
  const clipboard = useEditor((state) => state.clipboard);
  const projektId = useEditor((state) => state.projektId);
  const view = useEditor((state) => state.view);
  const density = useAnsicht((state) => state.density);
  const theme = useAnsicht((state) => state.theme);
  const issuePanelOpen = useEditor((state) => state.issuePanelOpen);
  const canUndo = useEditor((state) => state.history.past.length > 0);
  const canRedo = useEditor((state) => state.history.future.length > 0);

  const speichern = useEditor((state) => state.speichern);
  const alsNeuesProjektSpeichern = useEditor((state) => state.alsNeuesProjektSpeichern);
  const undo = useEditor((state) => state.undo);
  const redo = useEditor((state) => state.redo);
  const copyNode = useEditor((state) => state.copyNode);
  const cutNode = useEditor((state) => state.cutNode);
  const addElement = useEditor((state) => state.addElement);
  const duplicateElement = useEditor((state) => state.duplicateElement);
  const requestDelete = useEditor((state) => state.requestDelete);
  const requestPaste = useEditor((state) => state.requestPaste);
  const setView = useEditor((state) => state.setView);
  const setDensity = useAnsicht((state) => state.setDensity);
  const setTheme = useAnsicht((state) => state.setTheme);
  const setIssuePanelOpen = useEditor((state) => state.setIssuePanelOpen);
  const expandAll = useEditor((state) => state.expandAll);
  const revalidate = useEditor((state) => state.revalidate);

  const knoten = model && selection ? model.nodes[selection] : undefined;
  const istWurzel = knoten !== undefined && knoten.parent === null;

  /** Welche Typen darf die Auswahl aufnehmen? Dieselbe Frage wie im Kontextmenue. */
  const neueTypen = (() => {
    if (!model || !knoten) return [] as { slot: string; kind: string }[];
    const treffer: { slot: string; kind: string }[] = [];
    for (const slot of childSlotsOf(knoten.kind)) {
      for (const kind of SUBMODEL_ELEMENT_KINDS) {
        if (canContain(knoten.kind, slot.name, kind, knoten.data)) {
          treffer.push({ slot: slot.name, kind });
        }
      }
    }
    return treffer;
  })();

  return (
    <div className="flex h-(--h-menubar) shrink-0 items-center gap-3 border-b border-border-subtle bg-muted px-3">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-[18px] rounded-sm"
          style={{ backgroundImage: "var(--logo-gradient)" }}
        />
        <span className="font-display text-md font-bold text-foreground">{t("app.titel")}</span>
      </div>

      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>{t("menu.datei")}</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onSelect={onOeffnen}>{t("app.oeffnen")}</MenubarItem>
            <MenubarItem disabled={projektId === null} onSelect={() => void speichern()}>
              {t("menu.speichern")}
              <MenubarShortcut>{ersteTasteFuer("hilfe.speichern")}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              disabled={!model}
              onSelect={() => void alsNeuesProjektSpeichern(meta?.fileName ?? t("projekte.neu"))}
            >
              {t("menu.alsNeuesProjekt")}
            </MenubarItem>
            <MenubarItem disabled={projektId === null} onSelect={onVersionen}>
              {t("versionen.knopf")}
            </MenubarItem>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger disabled={!model}>{t("app.exportieren")}</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem onSelect={() => onExport("json")}>{t("export.json")}</MenubarItem>
                <MenubarItem onSelect={() => onExport("xml")}>{t("export.xml")}</MenubarItem>
                <MenubarItem onSelect={() => onExport("aasx")}>{t("export.aasx")}</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator />
            <MenubarItem asChild>
              <Link to="/projekte">{t("menu.zurListe")}</Link>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>{t("menu.bearbeiten")}</MenubarTrigger>
          <MenubarContent>
            <MenubarItem disabled={!canUndo} onSelect={undo}>
              {t("app.rueckgaengig")}
              <MenubarShortcut>{ersteTasteFuer("hilfe.rueckgaengig")}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem disabled={!canRedo} onSelect={redo}>
              {t("app.wiederholen")}
              <MenubarShortcut>{ersteTasteFuer("hilfe.wiederholen")}</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem
              disabled={!selection || istWurzel}
              onSelect={() => selection && cutNode(selection)}
            >
              {t("menu.ausschneiden")}
              <MenubarShortcut>{ersteTasteFuer("hilfe.ausschneiden")}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              disabled={!selection || istWurzel}
              onSelect={() => selection && copyNode(selection)}
            >
              {t("menu.kopieren")}
              <MenubarShortcut>{ersteTasteFuer("hilfe.kopieren")}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              disabled={!selection || clipboard === null}
              onSelect={() => selection && requestPaste(selection)}
            >
              {t("menu.einfuegen")}
              <MenubarShortcut>{ersteTasteFuer("hilfe.einfuegen")}</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger disabled={neueTypen.length === 0}>
                {t("menu.neu")}
              </MenubarSubTrigger>
              <MenubarSubContent className="max-h-80 overflow-auto">
                {neueTypen.map((eintrag) => (
                  <MenubarItem
                    key={`${eintrag.slot}-${eintrag.kind}`}
                    onSelect={() => selection && addElement(selection, eintrag.slot, eintrag.kind)}
                  >
                    {eintrag.kind}
                  </MenubarItem>
                ))}
              </MenubarSubContent>
            </MenubarSub>
            <MenubarItem
              disabled={!selection || istWurzel}
              onSelect={() => selection && duplicateElement(selection)}
            >
              {t("menu.duplizieren")}
              <MenubarShortcut>{ersteTasteFuer("hilfe.duplizieren")}</MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              disabled={!selection || istWurzel}
              onSelect={() => selection && requestDelete([selection])}
            >
              {t("menu.loeschen")}
              <MenubarShortcut>{ersteTasteFuer("hilfe.loeschen")}</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem
              disabled={!model}
              onSelect={() =>
                document.querySelector<HTMLInputElement>("[data-tree-filter]")?.focus()
              }
            >
              {t("menu.filterFokussieren")}
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>{t("menu.ansicht")}</MenubarTrigger>
          <MenubarContent>
            <MenubarRadioGroup value={view} onValueChange={(wert) => setView(wert as View)}>
              <MenubarRadioItem value="formular" disabled={!model}>
                {t("sicht.formular")}
              </MenubarRadioItem>
              <MenubarRadioItem value="tabelle" disabled={!model}>
                {t("sicht.tabelle")}
              </MenubarRadioItem>
              <MenubarRadioItem value="graph" disabled={!model}>
                {t("sicht.graph")}
              </MenubarRadioItem>
            </MenubarRadioGroup>
            <MenubarSeparator />
            <MenubarCheckboxItem
              checked={issuePanelOpen}
              disabled={!model}
              onCheckedChange={(offen) => setIssuePanelOpen(offen)}
            >
              {t("menu.befunde")}
            </MenubarCheckboxItem>
            <MenubarSeparator />
            <MenubarItem disabled={!model} onSelect={() => expandAll(true)}>
              {t("menu.allesAufklappen")}
            </MenubarItem>
            <MenubarItem disabled={!model} onSelect={() => expandAll(false)}>
              {t("menu.allesZuklappen")}
            </MenubarItem>
            <MenubarSeparator />
            <MenubarRadioGroup
              value={density}
              onValueChange={(wert) => setDensity(wert as Density)}
            >
              <MenubarRadioItem value="compact">{t("app.dichteKompakt")}</MenubarRadioItem>
              <MenubarRadioItem value="cozy">{t("app.dichteKomfortabel")}</MenubarRadioItem>
            </MenubarRadioGroup>
            <MenubarSeparator />
            <MenubarRadioGroup value={theme} onValueChange={(wert) => setTheme(wert as Theme)}>
              <MenubarRadioItem value="light">{t("app.hell")}</MenubarRadioItem>
              <MenubarRadioItem value="dark">{t("app.dunkel")}</MenubarRadioItem>
            </MenubarRadioGroup>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>{t("menu.werkzeuge")}</MenubarTrigger>
          <MenubarContent>
            <MenubarItem disabled={!model} onSelect={() => void revalidate()}>
              {t("werkzeug.validieren")}
            </MenubarItem>
            <MenubarItem disabled={!model} onSelect={onPalette}>
              {t("menu.palette")}
              <MenubarShortcut>{ersteTasteFuer("hilfe.palette")}</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onSelect={onEinstellungen}>{t("werkzeug.einstellungen")}</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>{t("menu.hilfe")}</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onSelect={onTastaturwege}>{t("hilfe.tastaturwege")}</MenubarItem>
            <MenubarItem onSelect={onUeber}>{t("hilfe.ueber")}</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <div className="ml-auto flex items-center gap-2">
        {meta ? (
          <span className="truncate font-mono text-xs text-foreground-faint">{meta.fileName}</span>
        ) : null}
        <SaveChip />
      </div>
    </div>
  );
}
