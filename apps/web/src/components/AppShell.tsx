import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  ArrowLeft,
  Download,
  FolderOpen,
  History,
  Moon,
  Redo2,
  Rows2,
  Rows3,
  Save,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IssuePanel } from "@/components/Issues/IssuePanel";
import { ExportDialog, needsExportWarning } from "@/components/ExportDialog";
import { CommandPalette } from "@/components/CommandPalette";
import { RestoreDialog } from "@/components/RestoreDialog";
import { ConflictDialog } from "@/components/ConflictDialog";
import { VersionDialog } from "@/components/Versions/VersionDialog";
import { nodeCount, useEditor, type View } from "@/store/editor";

/**
 * Tabelle und Graph werden erst geladen, wenn man sie oeffnet. Zusammen sind sie 115 KB
 * gzip, dazu elkjs mit 456 KB im Worker. Im Startbundle haetten sie nichts zu suchen,
 * und `pnpm budget` wuerde es sofort melden.
 */
const TableView = lazy(() => import("@/components/Table/TableView"));
const GraphView = lazy(() => import("@/components/Graph/GraphView"));

const SICHTEN: readonly View[] = ["formular", "tabelle", "graph"];

/**
 * Rahmen der Anwendung: Kopfleiste, geteilte Arbeitsflaeche, Statusleiste.
 * Import per Ablegen auf das Fenster, Export ueber die Kopfleiste (Plan Abschnitt 11).
 */
export function AppShell() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [exportFormat, setExportFormat] = useState<"json" | "xml" | "aasx" | null>(null);
  const [versionenOffen, setVersionenOffen] = useState(false);

  const model = useEditor((state) => state.model);
  const meta = useEditor((state) => state.meta);
  const status = useEditor((state) => state.status);
  const error = useEditor((state) => state.error);
  const issues = useEditor((state) => state.issues);
  const density = useEditor((state) => state.density);
  const theme = useEditor((state) => state.theme);
  const canUndo = useEditor((state) => state.history.past.length > 0);
  const canRedo = useEditor((state) => state.history.future.length > 0);
  const issuePanelOpen = useEditor((state) => state.issuePanelOpen);
  const view = useEditor((state) => state.view);

  const openFile = useEditor((state) => state.openFile);
  const exportAs = useEditor((state) => state.exportAs);
  const undo = useEditor((state) => state.undo);
  const redo = useEditor((state) => state.redo);
  const setDensity = useEditor((state) => state.setDensity);
  const setTheme = useEditor((state) => state.setTheme);
  const setIssuePanelOpen = useEditor((state) => state.setIssuePanelOpen);
  const setView = useEditor((state) => state.setView);

  const projektId = useEditor((state) => state.projektId);
  const projektName = useEditor((state) => state.projektName);
  const serverStatus = useEditor((state) => state.serverStatus);
  const anhaengeBereit = useEditor((state) => state.anhaengeBereit);
  const speichern = useEditor((state) => state.speichern);

  /** Warnen statt blockieren: gibt es nichts zu sagen, wird sofort exportiert. */
  const requestExport = (format: "json" | "xml" | "aasx") => {
    const constraints = issues.filter((issue) => issue.severity === "constraint").length;
    const warnungen = issues.length - constraints;
    if (needsExportWarning(format, meta?.attachments.length ?? 0, constraints, warnungen)) {
      setExportFormat(format);
    } else {
      void exportAs(format);
    }
  };

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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" asChild>
              <Link to="/projekte" aria-label={t("app.zurListe")}>
                <ArrowLeft />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("app.zurListe")}</TooltipContent>
        </Tooltip>

        <span className="mr-2 max-w-48 truncate text-sm font-semibold">
          {projektName ?? t("app.titel")}
        </span>

        <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
          <FolderOpen data-icon="inline-start" />
          {t("app.oeffnen")}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          data-speichern
          disabled={!model || projektId === null || serverStatus === "speichert"}
          onClick={() => void speichern()}
        >
          <Save data-icon="inline-start" />
          {t(`speichern.${serverStatus}`)}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          disabled={projektId === null}
          onClick={() => setVersionenOffen(true)}
        >
          <History data-icon="inline-start" />
          {t("versionen.knopf")}
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
              <DropdownMenuItem onSelect={() => requestExport("json")}>
                {t("export.json")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => requestExport("xml")}>
                {t("export.xml")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => requestExport("aasx")}>
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

        <Tabs
          value={view}
          onValueChange={(next) => setView(next as View)}
          className="ml-4"
        >
          <TabsList>
            {SICHTEN.map((sicht) => (
              <TabsTrigger key={sicht} value={sicht} disabled={!model} data-view={sicht}>
                {t(`sicht.${sicht}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

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
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize={issuePanelOpen ? "70" : "100"} minSize="30">
              <ResizablePanelGroup orientation="horizontal">
                <ResizablePanel defaultSize="38" minSize="20">
                  <div className="h-full bg-sidebar">
                    <Tree />
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize="62" minSize="30">
                  <Suspense fallback={<SichtLaedt />}>
                    {view === "formular" ? <Inspector /> : null}
                    {view === "tabelle" ? <TableView /> : null}
                    {view === "graph" ? <GraphView /> : null}
                  </Suspense>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>

            {issuePanelOpen ? (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize="30" minSize="12">
                  <IssuePanel />
                </ResizablePanel>
              </>
            ) : null}
          </ResizablePanelGroup>
        ) : (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyTitle>{status === "laedt" ? t("status.wirdGelesen") : t("leer.titel")}</EmptyTitle>
              <EmptyDescription>{t("leer.text")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => inputRef.current?.click()}>{t("leer.knopf")}</Button>
              <p className="mt-2 text-2xs text-muted-foreground">{t("app.palette")}</p>
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
            {!anhaengeBereit ? <span>{t("status.anhaengeLaden")}</span> : null}
          </>
        ) : (
          <span>{t("status.keineDatei")}</span>
        )}

        {/* Die Zaehler sind der Weg ins Befund-Panel. */}
        <button
          type="button"
          data-issues-toggle
          disabled={!model}
          onClick={() => setIssuePanelOpen(!issuePanelOpen)}
          className="ml-auto flex items-center gap-3 rounded-xs px-1 hover:bg-accent disabled:hover:bg-transparent"
        >
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
        </button>
      </footer>

      {error ? (
        <div
          role="alert"
          className="fixed right-4 bottom-10 max-w-md rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground shadow-(--shadow-overlay)"
        >
          {error}
        </div>
      ) : null}

      <ExportDialog format={exportFormat} onClose={() => setExportFormat(null)} />

      <CommandPalette />
      <RestoreDialog />
      <ConflictDialog />
      <VersionDialog offen={versionenOffen} onClose={() => setVersionenOffen(false)} />

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

/** Platzhalter, waehrend Tabelle oder Graph nachgeladen werden. */
function SichtLaedt() {
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="flex-1 w-full" />
    </div>
  );
}
