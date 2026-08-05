import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tree } from "@/components/Tree/Tree";
import { Inspector } from "@/components/Inspector/Inspector";
import { Skeleton } from "@/components/ui/skeleton";
import { IssuePanel } from "@/components/Issues/IssuePanel";
import { ExportDialog, needsExportWarning } from "@/components/ExportDialog";
import { CommandPalette, PALETTE_EVENT } from "@/components/CommandPalette";
import { RestoreDialog } from "@/components/RestoreDialog";
import { ConflictDialog } from "@/components/ConflictDialog";
import { DeleteDialog } from "@/components/Tree/DeleteDialog";
import { PasteDialog } from "@/components/Tree/PasteDialog";
import { VersionDialog } from "@/components/Versions/VersionDialog";
import { AboutDialog } from "@/components/Shell/AboutDialog";
import { MenuBar } from "@/components/Shell/MenuBar";
import { SettingsDialog } from "@/components/Shell/SettingsDialog";
import { ShortcutsDialog } from "@/components/Shell/ShortcutsDialog";
import { StatusBar } from "@/components/Shell/StatusBar";
import { Toolbar } from "@/components/Shell/Toolbar";
import { useAssistant } from "@/store/assistant";
import { useEditor } from "@/store/editor";

/**
 * Tabelle, Graph und Assistent werden erst geladen, wenn man sie oeffnet. Zusammen sind
 * Tabelle und Graph 115 KB gzip, dazu elkjs mit 456 KB im Worker. Im Startbundle haetten
 * sie nichts zu suchen, und `pnpm budget` wuerde es sofort melden.
 */
const TableView = lazy(() => import("@/components/Table/TableView"));
const GraphView = lazy(() => import("@/components/Graph/GraphView"));
const AssistantPanel = lazy(() =>
  import("@/components/Assistant/AssistantPanel").then((m) => ({ default: m.AssistantPanel })),
);

/**
 * Rahmen der Anwendung: Menuezeile, Werkzeugleiste, geteilte Arbeitsflaeche, Statusleiste.
 *
 * Diese Datei komponiert nur. Was hier bleiben muss, damit nichts bricht: der Drop-Handler
 * auf dem Wurzelelement, das versteckte Dateifeld (die Kommando-Palette greift darauf zu),
 * die globalen Tastenwege und die Haltung saemtlicher Dialoge.
 */
export function AppShell() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [exportFormat, setExportFormat] = useState<"json" | "xml" | "aasx" | null>(null);
  const [versionenOffen, setVersionenOffen] = useState(false);
  const [einstellungenOffen, setEinstellungenOffen] = useState(false);
  const [tastaturwegeOffen, setTastaturwegeOffen] = useState(false);
  const [ueberOffen, setUeberOffen] = useState(false);

  const model = useEditor((state) => state.model);
  const meta = useEditor((state) => state.meta);
  const status = useEditor((state) => state.status);
  const error = useEditor((state) => state.error);
  const issues = useEditor((state) => state.issues);
  const density = useEditor((state) => state.density);
  const theme = useEditor((state) => state.theme);
  const issuePanelOpen = useEditor((state) => state.issuePanelOpen);
  const view = useEditor((state) => state.view);

  const openFile = useEditor((state) => state.openFile);
  const exportAs = useEditor((state) => state.exportAs);
  const undo = useEditor((state) => state.undo);
  const redo = useEditor((state) => state.redo);
  const speichern = useEditor((state) => state.speichern);

  const assistentOffen = useAssistant((state) => state.offen);
  const toggleAssistent = useAssistant((state) => state.umschalten);

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

  // Globale Tastenwege. Strg+K gehoert der Palette, sie hoert selbst zu.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const taste = event.key.toLowerCase();
      if (taste === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (taste === "y" || (taste === "z" && event.shiftKey)) {
        event.preventDefault();
        redo();
      } else if (taste === "s") {
        event.preventDefault();
        void speichern();
      } else if (taste === "j") {
        event.preventDefault();
        toggleAssistent();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, speichern, toggleAssistent]);

  return (
    <div
      className="flex h-screen flex-col bg-background"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) void openFile(file);
      }}
    >
      <MenuBar
        onOeffnen={() => inputRef.current?.click()}
        onExport={requestExport}
        onVersionen={() => setVersionenOffen(true)}
        onPalette={() => window.dispatchEvent(new Event(PALETTE_EVENT))}
        onEinstellungen={() => setEinstellungenOffen(true)}
        onTastaturwege={() => setTastaturwegeOffen(true)}
        onUeber={() => setUeberOffen(true)}
      />

      <Toolbar
        onOeffnen={() => inputRef.current?.click()}
        onExport={requestExport}
        onEinstellungen={() => setEinstellungenOffen(true)}
      />

      <div className="flex min-h-0 flex-1">
        <main className="min-h-0 min-w-0 flex-1">
          {model ? (
            <ResizablePanelGroup orientation="vertical">
              <ResizablePanel defaultSize={issuePanelOpen ? "70" : "100"} minSize="30">
                <ResizablePanelGroup orientation="horizontal">
                  <ResizablePanel defaultSize="30" minSize="18">
                    <div className="h-full border-r border-border bg-sidebar">
                      <Tree />
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize="70" minSize="30">
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
          ) : status === "laedt" ? (
            // Waehrend des Ladens ein Geruest statt eines anderen Textes: bei einem
            // grossen Modell dauert das mehrere Sekunden, und ein blosser Satz sieht in
            // dieser Zeit aus wie ein Endzustand.
            <SichtLaedt />
          ) : (
            <Empty className="h-full">
              <EmptyHeader>
                <EmptyTitle>{status === "fehler" ? t("fehler.titel") : t("leer.titel")}</EmptyTitle>
                <EmptyDescription>
                  {status === "fehler" && error ? error : t("leer.text")}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => inputRef.current?.click()}>{t("leer.knopf")}</Button>
                <p className="mt-2 text-2xs text-muted-foreground">{t("app.palette")}</p>
              </EmptyContent>
            </Empty>
          )}
        </main>

        {/*
          Der Assistent verdraengt die Sicht, statt sie zu ueberlagern: die Tabelle wird
          dadurch tatsaechlich schmaler und faellt von selbst auf drei Spalten zurueck.
          Bewusst kein weiterer ResizablePanel, sonst wandern die Prozentgroessen.
        */}
        {assistentOffen ? (
          <Suspense fallback={<div className="w-90 shrink-0 border-l border-border bg-muted" />}>
            <AssistantPanel />
          </Suspense>
        ) : null}
      </div>

      <StatusBar />

      <ExportDialog format={exportFormat} onClose={() => setExportFormat(null)} />
      <CommandPalette />
      <RestoreDialog />
      <ConflictDialog />
      <DeleteDialog />
      <PasteDialog />
      <VersionDialog offen={versionenOffen} onClose={() => setVersionenOffen(false)} />
      <SettingsDialog offen={einstellungenOffen} onClose={() => setEinstellungenOffen(false)} />
      <ShortcutsDialog offen={tastaturwegeOffen} onClose={() => setTastaturwegeOffen(false)} />
      <AboutDialog offen={ueberOffen} onClose={() => setUeberOffen(false)} />

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
      <Skeleton className="w-full flex-1" />
    </div>
  );
}
