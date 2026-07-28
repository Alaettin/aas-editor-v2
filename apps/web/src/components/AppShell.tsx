import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Download,
  FolderOpen,
  Moon,
  Redo2,
  Rows2,
  Rows3,
  Sun,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tree } from "@/components/Tree/Tree";
import { Inspector } from "@/components/Inspector/Inspector";
import { nodeCount, useEditor } from "@/store/editor";

/**
 * Rahmen der Anwendung: Kopfleiste, geteilte Arbeitsflaeche, Statusleiste.
 * Import per Ablegen auf das Fenster, Export ueber die Kopfleiste (Plan Abschnitt 11).
 */
export function AppShell() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const model = useEditor((state) => state.model);
  const meta = useEditor((state) => state.meta);
  const status = useEditor((state) => state.status);
  const error = useEditor((state) => state.error);
  const issues = useEditor((state) => state.issues);
  const density = useEditor((state) => state.density);
  const theme = useEditor((state) => state.theme);
  const canUndo = useEditor((state) => state.history.past.length > 0);
  const canRedo = useEditor((state) => state.history.future.length > 0);

  const openFile = useEditor((state) => state.openFile);
  const exportAs = useEditor((state) => state.exportAs);
  const undo = useEditor((state) => state.undo);
  const redo = useEditor((state) => state.redo);
  const setDensity = useEditor((state) => state.setDensity);
  const setTheme = useEditor((state) => state.setTheme);

  // Hell und Dunkel sowie die Dichte haengen am Wurzelelement, damit die Tokens greifen.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset["density"] = density;
  }, [theme, density]);

  // Undo und Redo gelten im ganzen Fenster, nicht nur im Baum.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (event.key === "y" || (event.key === "z" && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const constraints = issues.filter((issue) => issue.severity === "constraint").length;
  const warnings = issues.length - constraints;

  return (
    <div
      className="flex h-screen flex-col"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) void openFile(file);
      }}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-sidebar px-3">
        <span className="mr-2 text-sm font-semibold">{t("app.titel")}</span>

        <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
          <FolderOpen data-icon="inline-start" />
          {t("app.oeffnen")}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={!model}>
              <Download data-icon="inline-start" />
              {t("app.exportieren")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => void exportAs("json")}>
                {t("export.json")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportAs("xml")}>
                {t("export.xml")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportAs("aasx")}>
                {t("export.aasx")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" disabled={!canUndo} onClick={undo}>
              <Undo2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("app.rueckgaengig")} (Strg+Z)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" disabled={!canRedo} onClick={redo}>
              <Redo2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("app.wiederholen")} (Strg+Y)</TooltipContent>
        </Tooltip>

        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("app.dichte")}
                onClick={() => setDensity(density === "cozy" ? "compact" : "cozy")}
              >
                {density === "cozy" ? <Rows3 /> : <Rows2 />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {density === "cozy" ? t("app.dichteKompakt") : t("app.dichteKomfortabel")}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("app.erscheinung")}
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <Sun /> : <Moon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{theme === "dark" ? t("app.hell") : t("app.dunkel")}</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        {model ? (
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize="38" minSize="20">
              <div className="h-full bg-sidebar">
                <Tree />
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="62" minSize="30">
              <Inspector />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyTitle>{status === "laedt" ? t("status.wirdGelesen") : t("leer.titel")}</EmptyTitle>
              <EmptyDescription>{t("leer.text")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => inputRef.current?.click()}>{t("leer.knopf")}</Button>
            </EmptyContent>
          </Empty>
        )}
      </main>

      <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-border bg-sidebar px-3 text-2xs text-muted-foreground">
        {meta ? (
          <>
            <span>
              {t("status.quelle", {
                format: meta.format.toUpperCase(),
                version:
                  meta.sourceVersion === "unbekannt"
                    ? t("status.versionUnbekannt")
                    : meta.sourceVersion,
              })}
            </span>
            <span data-numeric>{t("status.knoten", { count: nodeCount(model) })}</span>
            {meta.attachments.length > 0 ? (
              <span data-numeric>{t("status.anhaenge", { count: meta.attachments.length })}</span>
            ) : null}
          </>
        ) : (
          <span>{t("status.keineDatei")}</span>
        )}

        <span className="ml-auto flex items-center gap-3">
          {constraints > 0 ? (
            <span className="text-destructive" data-numeric>
              {t("status.constraints", { count: constraints })}
            </span>
          ) : null}
          {warnings > 0 ? (
            <span className="text-warning" data-numeric>
              {t("status.warnungen", { count: warnings })}
            </span>
          ) : null}
          {model && issues.length === 0 ? <span>{t("status.keineBefunde")}</span> : null}
        </span>
      </footer>

      {error ? (
        <div
          role="alert"
          className="fixed right-4 bottom-10 max-w-md rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground shadow-(--shadow-overlay)"
        >
          {error}
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept=".json,.xml,.aasx"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void openFile(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
