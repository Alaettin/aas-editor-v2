import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Download,
  FolderOpen,
  ListTree,
  Moon,
  Redo2,
  Rows2,
  Rows3,
  Languages,
  ShieldAlert,
  Sun,
  Table2,
  Workflow,
  FileText,
  Undo2,
} from "lucide-react";
import { search } from "@aas-editor/core";

import { Chip } from "@/components/ui/chip";
import { shortKind, toneOf } from "@/lib/typeOf";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useEditor } from "@/store/editor";
import { ersteTasteFuer } from "@/lib/shortcuts";
import { useAnsicht } from "@/store/ansicht";

/**
 * Kommando-Palette, Strg oder Cmd plus K (Plan Abschnitt 8).
 *
 * Sie ist zum **Zielen**: Element suchen und anspringen, Befehl ausfuehren. Zum
 * Stoebern und Eingrenzen gibt es das Filterfeld ueber dem Baum.
 *
 * Die Elementsuche nutzt dieselbe `search` aus dem Kern wie das Filterfeld. Es gibt nur
 * eine Suche im Projekt.
 */
/** Ereignisname, mit dem andere Flaechen die Palette oeffnen. */
export const PALETTE_EVENT = "aas:palette";

export function CommandPalette() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const model = useEditor((state) => state.model);
  const goToNode = useEditor((state) => state.goToNode);
  const exportAs = useEditor((state) => state.exportAs);
  const undo = useEditor((state) => state.undo);
  const redo = useEditor((state) => state.redo);
  const theme = useAnsicht((state) => state.theme);
  const density = useAnsicht((state) => state.density);
  const setTheme = useAnsicht((state) => state.setTheme);
  const setDensity = useAnsicht((state) => state.setDensity);
  const language = useAnsicht((state) => state.language);
  const setLanguage = useAnsicht((state) => state.setLanguage);
  const issuePanelOpen = useEditor((state) => state.issuePanelOpen);
  const setView = useEditor((state) => state.setView);
  const setIssuePanelOpen = useEditor((state) => state.setIssuePanelOpen);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    // Die Menuezeile oeffnet die Palette ueber dieses Ereignis, statt ihren Zustand von
    // aussen zu fuehren. Die Palette bleibt damit fuer sich zustaendig.
    const onOeffnen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(PALETTE_EVENT, onOeffnen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(PALETTE_EVENT, onOeffnen);
    };
  }, []);

  /**
   * Suchbegriffe je Befehl, in der aktiven Sprache.
   *
   * cmdk sucht im `value`, nicht in der Beschriftung. Standen dort weiter die deutschen
   * Stichwoerter, faende ein englischer Nutzer mit "undo" nichts, obwohl "Undo" im Bild
   * steht.
   */
  const stichwort = (...gruppen: string[]) =>
    gruppen.map((gruppe) => t(`palette.stichwort.${gruppe}`)).join(" ");

  const treffer = useMemo(() => {
    if (!model || query.trim() === "") return [];
    return search(model, query, 30);
  }, [model, query]);

  const ausfuehren = (aktion: () => void) => {
    setOpen(false);
    setQuery("");
    aktion();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
      title={t("palette.titel")}
      description={t("palette.beschreibung")}
    >
      {/*
        Wichtig: `CommandDialog` von shadcn bringt **kein** <Command> mit, es ist nur
        Dialog plus Inhalt. Ohne diese Wurzel fehlt cmdk sein Kontext und die Palette
        stuerzt beim Oeffnen ab ("Cannot read properties of undefined (reading
        'subscribe')").
      */}
      <Command>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={t("palette.platzhalter")}
        />
        <CommandList>
          <CommandEmpty>{t("palette.nichts")}</CommandEmpty>

          {treffer.length > 0 ? (
            <CommandGroup heading={t("palette.elemente")}>
              {treffer.map((hit) => (
                <CommandItem
                  key={hit.nodeId}
                  value={`${hit.label} ${hit.kind} ${hit.excerpt} ${hit.nodeId}`}
                  onSelect={() => ausfuehren(() => goToNode(hit.nodeId))}
                >
                  <ListTree />
                  <span className="truncate">{hit.label}</span>
                  <Chip tone={toneOf(hit.kind)}>{shortKind(hit.kind)}</Chip>
                  <span className="ml-auto truncate text-2xs text-muted-foreground">
                    {hit.excerpt}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {treffer.length > 0 ? <CommandSeparator /> : null}

          <CommandGroup heading={t("palette.sichten")}>
            <CommandItem
              value={stichwort("sicht", "formular")}
              disabled={!model}
              onSelect={() => ausfuehren(() => setView("formular"))}
            >
              <FileText />
              {t("palette.zuFormular")}
            </CommandItem>
            <CommandItem
              value={stichwort("sicht", "tabelle")}
              disabled={!model}
              onSelect={() => ausfuehren(() => setView("tabelle"))}
            >
              <Table2 />
              {t("palette.zuTabelle")}
            </CommandItem>
            <CommandItem
              value={stichwort("sicht", "graph")}
              disabled={!model}
              onSelect={() => ausfuehren(() => setView("graph"))}
            >
              <Workflow />
              {t("palette.zuGraph")}
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading={t("palette.befehle")}>
            <CommandItem
              value={stichwort("oeffnen")}
              onSelect={() =>
                ausfuehren(() =>
                  document.querySelector<HTMLInputElement>('input[type="file"]')?.click(),
                )
              }
            >
              <FolderOpen />
              {t("app.oeffnen")}
            </CommandItem>

            {(["json", "xml", "aasx"] as const).map((format) => (
              <CommandItem
                key={format}
                value={`${stichwort("export")} ${format}`}
                disabled={!model}
                onSelect={() => ausfuehren(() => void exportAs(format))}
              >
                <Download />
                {t(`export.${format}`)}
              </CommandItem>
            ))}

            <CommandItem value={stichwort("rueckgaengig")} onSelect={() => ausfuehren(undo)}>
              <Undo2 />
              {t("app.rueckgaengig")}
              <CommandShortcut>{ersteTasteFuer("hilfe.rueckgaengig")}</CommandShortcut>
            </CommandItem>
            <CommandItem value={stichwort("wiederholen")} onSelect={() => ausfuehren(redo)}>
              <Redo2 />
              {t("app.wiederholen")}
              <CommandShortcut>{ersteTasteFuer("hilfe.wiederholen")}</CommandShortcut>
            </CommandItem>

            <CommandItem
              value={stichwort("befunde")}
              onSelect={() => ausfuehren(() => setIssuePanelOpen(!issuePanelOpen))}
            >
              <ShieldAlert />
              {issuePanelOpen ? t("palette.panelZu") : t("palette.panelAuf")}
            </CommandItem>

            <CommandItem
              value={stichwort("darstellung")}
              onSelect={() => ausfuehren(() => setTheme(theme === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? <Sun /> : <Moon />}
              {theme === "dark" ? t("app.hell") : t("app.dunkel")}
            </CommandItem>

            <CommandItem
              value={stichwort("dichte")}
              onSelect={() => ausfuehren(() => setDensity(density === "cozy" ? "compact" : "cozy"))}
            >
              {density === "cozy" ? <Rows3 /> : <Rows2 />}
              {density === "cozy" ? t("app.dichteKompakt") : t("app.dichteKomfortabel")}
            </CommandItem>

            <CommandItem
              value={stichwort("sprache")}
              onSelect={() => ausfuehren(() => setLanguage(language === "de" ? "en" : "de"))}
            >
              <Languages />
              {language === "de" ? t("app.englisch") : t("app.deutsch")}
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
