import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  ClipboardPaste,
  Copy,
  Download,
  FolderOpen,
  MessageSquare,
  PanelLeft,
  Plus,
  Redo2,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { canContain, childSlotsOf, SUBMODEL_ELEMENT_KINDS } from "@aas-editor/core";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAssistant } from "@/store/assistant";
import { useEditor } from "@/store/editor";
import { ViewSwitch } from "./ViewSwitch";
import { ersteTasteFuer } from "@/lib/shortcuts";

/**
 * Die Werkzeugleiste, seit dem 06.08.2026 der einzige Ort fuer Befehle: die Menuezeile
 * gibt es nicht mehr.
 *
 * Vier Gruppen wie in der Vorlage (Datei, Historie, Element, Validierung), rechts der
 * Sichtumschalter und der Assistent.
 *
 * "Exportieren" fragt nach dem Format, statt fest AASX zu schreiben, und "Neu" klappt die
 * Typwahl auf, statt nur das Filterfeld zu fokussieren. Beides tat bis zum 06.08.2026 etwas
 * anderes, als sein Symbol versprach; aufgefallen ist es erst, als die Menuezeile wegfiel,
 * die es aufgefangen hatte.
 */

interface Props {
  readonly onOeffnen: () => void;
  readonly onExport: () => void;
}

function Trenner() {
  return <span aria-hidden className="mx-1.5 h-[18px] w-px shrink-0 bg-border-subtle" />;
}

export function Toolbar({ onOeffnen, onExport }: Props) {
  const { t } = useTranslation();
  const serverStatus = useEditor((state) => state.serverStatus);
  const dirty = useEditor((state) => state.dirty);

  const model = useEditor((state) => state.model);
  const selection = useEditor((state) => state.selection);
  const projektId = useEditor((state) => state.projektId);
  const canUndo = useEditor((state) => state.history.past.length > 0);
  const canRedo = useEditor((state) => state.history.future.length > 0);

  const speichern = useEditor((state) => state.speichern);
  const undo = useEditor((state) => state.undo);
  const redo = useEditor((state) => state.redo);
  const addElement = useEditor((state) => state.addElement);
  const clipboard = useEditor((state) => state.clipboard);
  const copyNode = useEditor((state) => state.copyNode);
  const requestPaste = useEditor((state) => state.requestPaste);
  const requestDelete = useEditor((state) => state.requestDelete);

  const assistentOffen = useAssistant((state) => state.offen);
  const toggleAssistent = useAssistant((state) => state.umschalten);

  const knoten = model && selection ? model.nodes[selection] : undefined;
  const istWurzel = knoten === undefined || knoten.parent === null;

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

  /** Dieselben Eintraege, nach Slot gebuendelt und in der Reihenfolge des Deskriptors. */
  const typenJeSlot = (() => {
    const gebuendelt = new Map<string, string[]>();
    for (const eintrag of neueTypen) {
      const liste = gebuendelt.get(eintrag.slot);
      if (liste) liste.push(eintrag.kind);
      else gebuendelt.set(eintrag.slot, [eintrag.kind]);
    }
    return [...gebuendelt];
  })();

  const knopf = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    disabled = false,
    extra?: string,
  ) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-toolbar"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {extra ? ` (${extra})` : ""}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <div className="flex h-(--h-toolbar) shrink-0 items-center gap-0.5 border-b border-border bg-card px-2.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-toolbar" aria-label={t("menu.zurListe")} asChild>
            <Link to="/projekte">
              <PanelLeft />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("menu.zurListe")}</TooltipContent>
      </Tooltip>
      {/*
        Die Beschriftung folgt dem Serverzustand: "Speichert ...", "Konflikt", "Erneut
        speichern". Ein Knopf, der immer dasselbe sagt, verschweigt genau die Lage, in
        der man ihn braucht.
      */}
      {knopf(
        t(`speichern.${serverStatus}`),
        <Save />,
        () => void speichern(),
        // Ausgegraut, wenn es nichts zu speichern gibt. Massgeblich ist `dirty`, dasselbe
        // Feld wie beim orangen Punkt in der Fusszeile.
        projektId === null || !dirty || serverStatus === "speichert",
        ersteTasteFuer("hilfe.speichern"),
      )}
      {knopf(t("app.oeffnen"), <FolderOpen />, onOeffnen)}
      {/* Die Einstellungen sitzen seit dem 08.08.2026 in der Titelzeile, bei Sprache und
          Konto. Eine Einstellung ist kein Werkzeug am Modell. */}
      {knopf(t("app.exportieren"), <Download />, onExport, !model)}

      <Trenner />

      {knopf(
        t("app.rueckgaengig"),
        <Undo2 />,
        undo,
        !canUndo,
        ersteTasteFuer("hilfe.rueckgaengig"),
      )}
      {knopf(t("app.wiederholen"), <Redo2 />, redo, !canRedo, ersteTasteFuer("hilfe.wiederholen"))}

      <Trenner />

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-toolbar"
                aria-label={t("menu.neu")}
                disabled={neueTypen.length === 0}
              >
                <Plus />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("menu.neu")}</TooltipContent>
        </Tooltip>
        {/*
          `w-auto` loest die Breite vom 28px-Symbolknopf; `overflow-y-auto` statt
          `overflow-auto`, sonst wirft tailwind-merge das `overflow-x-hidden` der
          Basisklasse weg und das Menue scrollt auch waagerecht.
        */}
        <DropdownMenuContent align="start" className="max-h-96 w-auto min-w-56 overflow-y-auto">
          {typenJeSlot.map(([slot, typen]) => (
            <Fragment key={slot}>
              {/*
                Bei einer Operation kommen drei Slots mit je vierzehn Typen zusammen. Ohne
                Ueberschrift stuende jeder Typname dreimal gleich da, ohne dass man saehe,
                in welche Liste er ginge.
              */}
              {typenJeSlot.length > 1 ? (
                <DropdownMenuLabel>{t(`slot.${slot}`)}</DropdownMenuLabel>
              ) : null}
              {typen.map((kind) => (
                <DropdownMenuItem
                  key={`${slot}:${kind}`}
                  className="whitespace-nowrap"
                  onSelect={() => selection && addElement(selection, slot, kind)}
                >
                  {kind}
                </DropdownMenuItem>
              ))}
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {knopf(
        t("baum.kopieren"),
        <Copy />,
        () => selection && copyNode(selection),
        istWurzel,
        ersteTasteFuer("hilfe.kopieren"),
      )}
      {/*
        Einfuegen fragt nicht selbst: `PasteDialog` sucht den ersten passenden Slot, prueft
        mit `findPasteConflicts` auf doppelte fachliche id und bietet dann Ueberspringen,
        Ersetzen oder Neue id an. Ohne Konflikt fuegt er stumm ein.
      */}
      {knopf(
        t("baum.einfuegen"),
        <ClipboardPaste />,
        () => selection && requestPaste(selection),
        !selection || clipboard === null,
        ersteTasteFuer("hilfe.einfuegen"),
      )}
      {knopf(
        t("menu.loeschen"),
        <Trash2 />,
        () => selection && requestDelete([selection]),
        istWurzel,
        ersteTasteFuer("hilfe.loeschen"),
      )}

      <Trenner />

      <ViewSwitch />

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={toggleAssistent}
          className={cn(
            "gap-1.5",
            assistentOffen && "bg-type-aas-surface text-type-aas-text hover:bg-type-aas-surface/70",
          )}
        >
          <MessageSquare data-icon="inline-start" />
          {t("assistent.titel")}
        </Button>
      </div>
    </div>
  );
}
