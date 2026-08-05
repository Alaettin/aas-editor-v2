import { useTranslation } from "react-i18next";
import {
  Copy,
  Download,
  FolderOpen,
  MessageSquare,
  Moon,
  Plus,
  Redo2,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { KbdHint } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAssistant } from "@/store/assistant";
import { useEditor } from "@/store/editor";
import { ViewSwitch } from "./ViewSwitch";
import { ersteTasteFuer } from "@/lib/shortcuts";

/**
 * Symbolwerkzeugleiste in drei Gruppen: Datei, Historie, Element. Danach die Validierung
 * als eigene Pille, weil sie kein Symbol unter vielen ist, sondern die Aussage der Sicht.
 */

interface Props {
  readonly onOeffnen: () => void;
  readonly onExport: (format: "json" | "xml" | "aasx") => void;
  readonly onEinstellungen: () => void;
}

function Trenner() {
  return <span aria-hidden className="mx-1.5 h-[18px] w-px shrink-0 bg-border-subtle" />;
}

export function Toolbar({ onOeffnen, onExport, onEinstellungen }: Props) {
  const { t } = useTranslation();
  const serverStatus = useEditor((state) => state.serverStatus);

  const model = useEditor((state) => state.model);
  const selection = useEditor((state) => state.selection);
  const projektId = useEditor((state) => state.projektId);
  const theme = useEditor((state) => state.theme);
  const canUndo = useEditor((state) => state.history.past.length > 0);
  const canRedo = useEditor((state) => state.history.future.length > 0);

  const speichern = useEditor((state) => state.speichern);
  const undo = useEditor((state) => state.undo);
  const redo = useEditor((state) => state.redo);
  const duplicateElement = useEditor((state) => state.duplicateElement);
  const requestDelete = useEditor((state) => state.requestDelete);
  const setTheme = useEditor((state) => state.setTheme);
  const revalidate = useEditor((state) => state.revalidate);

  const assistentOffen = useAssistant((state) => state.offen);
  const toggleAssistent = useAssistant((state) => state.umschalten);

  const knoten = model && selection ? model.nodes[selection] : undefined;
  const istWurzel = knoten === undefined || knoten.parent === null;

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
      {knopf(t("app.oeffnen"), <FolderOpen />, onOeffnen)}
      {/*
        Die Beschriftung folgt dem Serverzustand: "Speichert ...", "Konflikt", "Erneut
        speichern". Ein Knopf, der immer dasselbe sagt, verschweigt genau die Lage, in
        der man ihn braucht.
      */}
      {knopf(
        t(`speichern.${serverStatus}`),
        <Save />,
        () => void speichern(),
        projektId === null,
        ersteTasteFuer("hilfe.speichern"),
      )}
      {knopf(t("app.exportieren"), <Download />, () => onExport("aasx"), !model)}

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

      {knopf(
        t("menu.neu"),
        <Plus />,
        () => document.querySelector<HTMLElement>("[data-tree-filter]")?.focus(),
        !model,
      )}
      {knopf(
        t("menu.duplizieren"),
        <Copy />,
        () => selection && duplicateElement(selection),
        istWurzel,
        ersteTasteFuer("hilfe.duplizieren"),
      )}
      {knopf(
        t("menu.loeschen"),
        <Trash2 />,
        () => selection && requestDelete([selection]),
        istWurzel,
        ersteTasteFuer("hilfe.loeschen"),
      )}

      <Trenner />

      <Button
        size="sm"
        variant="ghost"
        disabled={!model}
        onClick={() => void revalidate()}
        className="bg-type-sm-surface text-type-sm-text hover:bg-type-sm-surface/70"
      >
        <ShieldCheck data-icon="inline-start" />
        {t("werkzeug.validieren")}
      </Button>

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
          <KbdHint>{ersteTasteFuer("hilfe.assistent")}</KbdHint>
        </Button>

        <ViewSwitch />

        <Trenner />

        {knopf(
          theme === "dark" ? t("app.hell") : t("app.dunkel"),
          theme === "dark" ? <Sun /> : <Moon />,
          () => setTheme(theme === "dark" ? "light" : "dark"),
        )}
        {knopf(t("werkzeug.einstellungen"), <SlidersHorizontal />, onEinstellungen)}
      </div>
    </div>
  );
}
