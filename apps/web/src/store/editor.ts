import { create } from "zustand";
import {
  applyChange,
  copySubtree,
  countNodes,
  denormalize,
  duplicateNode,
  emptyHistory,
  getNode,
  insertNode,
  moveNode,
  normalize,
  pasteSubtree,
  removeNode,
  redo as redoModel,
  setField,
  undo as undoModel,
  type EditorModel,
  type Fragment,
  type History,
  type JsonValue,
  type NodeId,
  type PasteResult,
  type PasteStrategy,
} from "@aas-editor/core";
import type { ValidationIssue } from "@aas-editor/core/validation";

import { ApiError } from "@/api/client";
import { filesApi, projectsApi, versionsApi } from "@/api/projects";
import { aasWorker, type AttachmentInfo, type OpenResult } from "@/worker/bridge";
import { clearDraft, createAutosave, loadDraft, type Draft } from "./autosave";

/**
 * Der Zustand des Hauptthreads.
 *
 * Wichtigster Punkt: **jede** Aenderung laeuft durch `applyChange` und schickt die dabei
 * entstandenen Immer-Patches an den Worker. Das vollstaendige Modell geht nur einmal
 * ueber die Bruecke, beim Oeffnen. Danach bleibt der Datenverkehr konstant, unabhaengig
 * von der Modellgroesse (Plan Abschnitt 4).
 */

/**
 * Stabile Leerliste fuer Selektoren.
 *
 * `state.meta?.attachments ?? []` erzeugt bei jedem Rendern ein neues Array. Zustand
 * vergleicht mit `Object.is`, sieht also jedes Mal eine Aenderung und rendert erneut,
 * bis React mit "Maximum update depth exceeded" abbricht.
 */
export const NO_ATTACHMENTS: readonly AttachmentInfo[] = [];

export type Density = "compact" | "cozy";
/**
 * Die drei Sichten aus Plan Abschnitt 8. Der Baum bleibt in allen dreien links stehen,
 * gewechselt wird nur die rechte Flaeche: es ist ein Perspektivwechsel, kein Ortswechsel.
 */
export type View = "formular" | "tabelle" | "graph";
export type Theme = "light" | "dark";
export type Status = "leer" | "laedt" | "bereit" | "fehler";
/**
 * Verhaeltnis zum Serverstand. "ohneProjekt" heisst: aus einer Datei geoeffnet und noch
 * nirgends abgelegt.
 */
export type ServerStatus =
  "ohneProjekt" | "gespeichert" | "geaendert" | "speichert" | "konflikt" | "fehler";

interface OpenMeta {
  readonly format: OpenResult["format"];
  readonly sourceVersion: OpenResult["sourceVersion"];
  readonly fileName: string;
  readonly attachments: readonly AttachmentInfo[];
  readonly hasThumbnail: boolean;
}

interface EditorState {
  model: EditorModel | null;
  history: History;
  meta: OpenMeta | null;
  status: Status;
  error: string | null;

  selection: NodeId | null;
  expanded: Record<NodeId, true>;
  issues: readonly ValidationIssue[];
  /** Ob gerade geprueft wird. Bei grossen Modellen dauert das sichtbar lange. */
  pruefung: "ruht" | "laeuft";
  dirty: boolean;

  /**
   * Auftrag an den Inspector: Gruppe aufklappen, hinscrollen, fokussieren. Er quittiert
   * ihn nach dem Rendern ueber `clearFocusRequest`. Ohne diesen Umweg muesste der Sprung
   * wissen, wann das Formular fertig gerendert ist.
   */
  focusRequest: { nodeId: NodeId; field: string; token: number } | null;
  issuePanelOpen: boolean;
  /** Filtertext ueber dem Baum. Leer heisst: kein Filter. */
  filter: string;
  /** Die zuletzt kopierten oder ausgeschnittenen Elemente */
  clipboard: Fragment | null;

  density: Density;
  theme: Theme;
  view: View;

  openFile: (file: File) => Promise<void>;
  exportAs: (format: "json" | "xml" | "aasx") => Promise<void>;

  /** Das Projekt auf dem Server, zu dem der geoeffnete Stand gehoert. */
  projektId: string | null;
  projektName: string | null;
  /** Erwartete Revision fuer das optimistische Sperren. */
  revision: number;
  serverStatus: ServerStatus;
  serverKonflikt: { aktuelleRevision: number; aktualisiertAm: number } | null;
  /**
   * Ob die Anhangs-Bytes im Worker liegen. Solange sie fehlen, meldet die Validierung
   * jedes File-Element als fehlenden Anhang und ein AASX-Export waere unvollstaendig.
   */
  anhaengeBereit: boolean;

  ladeProjekt: (id: string) => Promise<void>;
  speichern: () => Promise<void>;
  alsNeuesProjektSpeichern: (name: string) => Promise<string | null>;
  konfliktSchliessen: () => void;
  versionAnlegen: (label: string | null) => Promise<void>;
  versionLaden: (versionId: string) => Promise<void>;

  /** Ein gefundener Entwurf aus IndexedDB, der zur Wiederherstellung angeboten wird */
  draft: Draft | null;
  checkForDraft: () => Promise<void>;
  restoreDraft: () => Promise<void>;
  discardDraft: () => Promise<void>;

  select: (nodeId: NodeId | null) => void;
  toggleExpanded: (nodeId: NodeId) => void;
  setExpanded: (nodeId: NodeId, open: boolean) => void;
  expandTo: (nodeId: NodeId) => void;
  expandAll: (open: boolean) => void;

  updateField: (nodeId: NodeId, key: string, value: JsonValue | undefined) => void;
  addElement: (parentId: NodeId, slot: string, kind: string, index?: number) => void;
  deleteElement: (nodeId: NodeId) => void;
  duplicateElement: (nodeId: NodeId) => void;
  moveElement: (nodeId: NodeId, targetParentId: NodeId, slot: string, index?: number) => void;

  undo: () => void;
  redo: () => void;

  /** Sprung aus dem Befund-Panel: auswaehlen, sichtbar machen, Feld fokussieren. */
  goToIssue: (issue: ValidationIssue) => void;
  goToNode: (nodeId: NodeId) => void;
  clearFocusRequest: () => void;
  setIssuePanelOpen: (open: boolean) => void;
  setFilter: (filter: string) => void;

  /** Zwischenablage: kopieren, ausschneiden, einfuegen */
  copyNode: (nodeId: NodeId) => void;
  cutNode: (nodeId: NodeId) => void;
  pasteInto: (
    parentId: NodeId,
    slot: string,
    fragment: Fragment,
    strategy?: PasteStrategy,
  ) => PasteResult | null;

  setDensity: (density: Density) => void;
  setTheme: (theme: Theme) => void;
  setView: (view: View) => void;

  /**
   * Zwei Rueckfragen, die von mehreren Stellen ausgeloest werden koennen: aus dem Baum,
   * aus dem Kontextmenue und aus der Menuezeile. Deshalb liegt der Zustand hier und nicht
   * im Baum.
   */
  pendingDeleteId: NodeId | null;
  pasteTargetId: NodeId | null;
  requestDelete: (nodeId: NodeId | null) => void;
  requestPaste: (nodeId: NodeId | null) => void;

  /** Validierung sofort anstossen, statt auf die Entprellung zu warten. */
  revalidate: () => Promise<void>;

  /** Zoomstufe des Graphen, fuer die Statusleiste ausserhalb des ReactFlowProvider. */
  graphZoom: number;
  setGraphZoom: (zoom: number) => void;
}

/**
 * Validierung entprellt im Worker anstossen. 300 ms nach der letzten Eingabe, wie in
 * Plan Abschnitt 7 vorgegeben. Die Validierung selbst kommt in Phase 4 an die Felder,
 * die Zahlen in der Statusleiste stimmen aber schon jetzt.
 */
let validateTimer: ReturnType<typeof setTimeout> | undefined;

/** Entprelltes Schreiben in IndexedDB, siehe autosave.ts. */
const autosave = createAutosave();

/** Welches Projekt gerade geladen wird, gegen doppelte Effektaufrufe. */
let laufendeLadung: string | null = null;

/**
 * Laufende Nummer der Validierung. Kommt ein ueberholtes Ergebnis zurueck, wird es
 * verworfen: sonst ueberschreibt eine langsame alte Pruefung die frische.
 */
let validateLauf = 0;
/** Wie lange die letzte Pruefung gedauert hat, Grundlage der Entprellung. */
let letzteValidierungsdauer = 0;

function scheduleValidation(set: (partial: Partial<EditorState>) => void): void {
  clearTimeout(validateTimer);
  // Bei kleinen Modellen ist die Pruefung nach einem Wimpernschlag da, dann darf sie
  // frueh laufen. Dauert sie spuerbar, waere derselbe Takt nur Leerlauf.
  const verzoegerung = letzteValidierungsdauer > 150 ? 800 : 300;
  const lauf = ++validateLauf;

  validateTimer = setTimeout(() => {
    set({ pruefung: "laeuft" });
    const begonnen = performance.now();
    void aasWorker()
      .validate()
      .then((issues) => {
        letzteValidierungsdauer = performance.now() - begonnen;
        if (lauf !== validateLauf) return;
        set({ issues, pruefung: "ruht" });
      })
      .catch(() => {
        // Eine fehlgeschlagene Validierung darf die Bearbeitung nicht anhalten.
        if (lauf === validateLauf) set({ pruefung: "ruht" });
      });
  }, verzoegerung);
}

export const useEditor = create<EditorState>()((set, get) => {
  /**
   * Der eine Weg, das Modell zu aendern. Erzeugt Patches, schiebt sie in die Historie
   * und schickt dieselben Patches an den Worker.
   */
  const change = (label: string, recipe: (draft: EditorModel) => void): void => {
    const { model, history } = get();
    if (!model) return;

    let result;
    try {
      result = applyChange(model, history, label, recipe);
    } catch (error) {
      set({ error: (error as Error).message });
      return;
    }

    set({
      model: result.model,
      history: result.history,
      dirty: true,
      error: null,
      // Ein Konflikt bleibt stehen, bis er beantwortet ist. Alles andere heisst jetzt
      // "ungespeichert".
      serverStatus:
        get().serverStatus === "konflikt"
          ? "konflikt"
          : get().projektId === null
            ? "ohneProjekt"
            : "geaendert",
    });
    void aasWorker().applyPatches(result.change.patches);
    scheduleValidation(set);

    // Der Entwurf wird erst gebaut, wenn wirklich geschrieben wird. `countNodes` laeuft
    // ueber alle Knoten und hat im Tastendruck nichts zu suchen.
    if (get().meta) {
      autosave(() => {
        const meta = get().meta;
        return {
          model: result.model,
          fileName: meta?.fileName ?? "",
          format: meta?.format ?? "json",
          attachmentPaths: meta?.attachments.map((entry) => entry.path) ?? [],
          savedAt: Date.now(),
          nodeCount: countNodes(result.model),
          projektId: get().projektId,
          revision: get().revision,
        };
      });
    }
  };

  return {
    model: null,
    history: emptyHistory,
    meta: null,
    status: "leer",
    error: null,

    selection: null,
    expanded: {},
    issues: [],
    pruefung: "ruht",
    dirty: false,
    focusRequest: null,
    issuePanelOpen: false,
    filter: "",
    clipboard: null,
    draft: null,

    projektId: null,
    projektName: null,
    revision: 0,
    serverStatus: "ohneProjekt",
    serverKonflikt: null,
    anhaengeBereit: true,

    density: "cozy",
    view: "formular",
    theme:
      typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",

    async openFile(file) {
      set({ status: "laedt", error: null, draft: null });
      // Eine frisch geoeffnete Datei ersetzt den alten Entwurf, er waere sonst irrefuehrend.
      void clearDraft();
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const opened = await aasWorker().open(bytes, file.name);

        // Die Wurzel und ihre Identifiables sind zu Beginn aufgeklappt, alles darunter
        // nicht. Ein Modell mit 10.000 Elementen soll nicht als 10.000 Zeilen starten.
        const expanded: Record<NodeId, true> = { [opened.model.rootId]: true };
        for (const ids of Object.values(opened.model.nodes[opened.model.rootId]?.children ?? {})) {
          for (const id of ids) expanded[id] = true;
        }

        set({
          model: opened.model,
          history: emptyHistory,
          meta: {
            format: opened.format,
            sourceVersion: opened.sourceVersion,
            fileName: file.name,
            attachments: opened.attachments,
            hasThumbnail: opened.hasThumbnail,
          },
          status: "bereit",
          selection: opened.model.rootId,
          expanded,
          issues: [],
          dirty: false,
          error: null,
          // Eine Datei gehoert zu keinem Projekt, bis sie eines wird.
          projektId: null,
          projektName: null,
          revision: 0,
          serverStatus: "ohneProjekt",
          serverKonflikt: null,
          anhaengeBereit: true,
        });

        const issues = await aasWorker().validate();
        set({ issues });
      } catch (error) {
        set({ status: "fehler", error: (error as Error).message });
      }
    },

    async exportAs(format) {
      try {
        const exported = await aasWorker().exportAs(format);
        const blob = new Blob([exported.bytes as BlobPart], { type: exported.contentType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = get().meta ? renameTo(get().meta!.fileName, format) : exported.fileName;
        anchor.click();
        URL.revokeObjectURL(url);
        // Exportiert heisst gesichert: der Entwurf wird nicht mehr gebraucht.
        void clearDraft();
        set({ dirty: false });
      } catch (error) {
        set({ error: (error as Error).message });
      }
    },

    async ladeProjekt(id) {
      if (get().projektId === id && get().model) return;
      // React ruft den Effekt der Editor-Route im Entwicklungsbetrieb zweimal auf. Ohne
      // diese Sperre laedt das Projekt doppelt, samt aller Anhaenge.
      if (laufendeLadung === id) return;
      laufendeLadung = id;
      set({ status: "laedt", error: null, draft: null, anhaengeBereit: false });

      try {
        const detail = await projectsApi.get(id);
        const model = normalize(detail.environment as Parameters<typeof normalize>[0]);
        await aasWorker().setModel(model);

        set({
          model,
          history: emptyHistory,
          meta: {
            format: (detail.projekt.sourceFormat || "json") as OpenResult["format"],
            sourceVersion: detail.projekt.metamodelVersion as OpenResult["sourceVersion"],
            fileName: `${detail.projekt.name}.${detail.projekt.sourceFormat || "json"}`,
            attachments: NO_ATTACHMENTS,
            hasThumbnail: false,
          },
          status: "bereit",
          selection: model.rootId,
          expanded: aufgeklappteWurzel(model),
          issues: [],
          dirty: false,
          error: null,
          projektId: detail.projekt.id,
          projektName: detail.projekt.name,
          revision: detail.revision,
          serverStatus: "gespeichert",
          serverKonflikt: null,
        });

        // Erst die Bytes, dann validieren. Andernfalls meldet die Validierung fuer jedes
        // File-Element kurz einen fehlenden Anhang und der Nutzer haelt seine Datei fuer
        // kaputt.
        await anhaengeHolen(id, set);
        set({ issues: await aasWorker().validate() });
      } catch (error) {
        set({
          status: "fehler",
          error: error instanceof ApiError ? error.message : (error as Error).message,
          anhaengeBereit: true,
        });
      } finally {
        laufendeLadung = null;
      }
    },

    async speichern() {
      const { model, projektId, revision, meta } = get();
      if (!model || projektId === null) return;

      set({ serverStatus: "speichert", error: null });
      try {
        await anhaengeHochladen(projektId);
        const antwort = await projectsApi.save(projektId, {
          revision,
          environment: denormalize(model),
          nodeCount: countNodes(model),
          ...(meta ? { sourceFormat: meta.format } : {}),
        });
        set({
          revision: antwort.projekt.revision,
          projektName: antwort.projekt.name,
          serverStatus: "gespeichert",
          serverKonflikt: null,
          dirty: false,
        });
        // Gespeichert heisst gesichert, der lokale Entwurf wird nicht mehr gebraucht.
        void clearDraft();
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 409 &&
          error.code === "revision-konflikt"
        ) {
          set({
            serverStatus: "konflikt",
            serverKonflikt: {
              aktuelleRevision: Number(error.details["aktuelleRevision"] ?? 0),
              aktualisiertAm: Number(error.details["aktualisiertAm"] ?? 0),
            },
          });
          return;
        }
        set({
          serverStatus: "fehler",
          error: error instanceof ApiError ? error.message : (error as Error).message,
        });
      }
    },

    async alsNeuesProjektSpeichern(name) {
      const { model, meta } = get();
      if (!model) return null;

      set({ serverStatus: "speichert", error: null });
      try {
        const antwort = await projectsApi.create({
          name,
          environment: denormalize(model),
          nodeCount: countNodes(model),
          ...(meta ? { sourceFormat: meta.format } : {}),
        });
        set({
          projektId: antwort.project.id,
          projektName: antwort.project.name,
          revision: antwort.project.revision,
          serverStatus: "gespeichert",
          serverKonflikt: null,
          dirty: false,
        });
        // Die Anhaenge gehoeren zum neuen Projekt, sie werden danach hochgeladen.
        await anhaengeHochladen(antwort.project.id);
        void clearDraft();
        return antwort.project.id;
      } catch (error) {
        set({
          serverStatus: "fehler",
          error: error instanceof ApiError ? error.message : (error as Error).message,
        });
        return null;
      }
    },

    konfliktSchliessen: () =>
      set({
        serverKonflikt: null,
        serverStatus: get().projektId === null ? "ohneProjekt" : "geaendert",
      }),

    async versionAnlegen(label) {
      const { projektId } = get();
      if (projektId === null) return;
      try {
        await versionsApi.create(projektId, label);
      } catch (error) {
        set({ error: error instanceof ApiError ? error.message : (error as Error).message });
      }
    },

    async versionLaden(versionId) {
      const { projektId } = get();
      if (projektId === null) return;

      set({ status: "laedt", error: null });
      try {
        const geladen = await versionsApi.get(projektId, versionId);
        const model = normalize(geladen.environment as Parameters<typeof normalize>[0]);
        await aasWorker().setModel(model);
        await anhaengeHolen(projektId, set);

        // Eine geladene Version ist noch nicht der Serverstand: sie muss gespeichert
        // werden, sonst waere das Zurueckholen ein stilles Ueberschreiben.
        set({
          model,
          history: emptyHistory,
          status: "bereit",
          selection: model.rootId,
          expanded: aufgeklappteWurzel(model),
          dirty: true,
          serverStatus: "geaendert",
          issues: await aasWorker().validate(),
        });
      } catch (error) {
        set({
          status: "fehler",
          error: error instanceof ApiError ? error.message : (error as Error).message,
        });
      }
    },

    async checkForDraft() {
      // Nur anbieten, solange nichts geoeffnet ist. Sonst wuerde die Rueckfrage die
      // gerade geladene Datei infrage stellen.
      if (get().model) return;
      const draft = await loadDraft();
      // Ein Entwurf, der zu einem Projekt gehoert, wird nur dort angeboten. Im
      // dateibasierten Betrieb waere er ohne Zusammenhang.
      if (draft && (draft.projektId ?? null) === null) set({ draft });
    },

    async restoreDraft() {
      const draft = get().draft;
      if (!draft) return;

      set({ status: "laedt" });
      try {
        // Der Worker kennt den Stand nicht, er muss ihn als Ganzes bekommen. Das ist
        // der einzige Fall neben dem Oeffnen, in dem das Vollmodell ueber die Bruecke geht.
        await aasWorker().setModel(draft.model);

        const expanded: Record<NodeId, true> = { [draft.model.rootId]: true };
        for (const ids of Object.values(draft.model.nodes[draft.model.rootId]?.children ?? {})) {
          for (const id of ids) expanded[id] = true;
        }

        set({
          model: draft.model,
          history: emptyHistory,
          meta: {
            format: draft.format as OpenResult["format"],
            sourceVersion: "3.1",
            fileName: draft.fileName,
            // Die Bytes sind nicht mitgespeichert worden, nur die Pfade.
            attachments: draft.attachmentPaths.map((path) => ({
              path,
              contentType: "",
              size: 0,
            })),
            hasThumbnail: false,
          },
          status: "bereit",
          selection: draft.model.rootId,
          expanded,
          dirty: true,
          draft: null,
          error: null,
        });

        set({ issues: await aasWorker().validate() });
      } catch (error) {
        set({ status: "fehler", error: (error as Error).message, draft: null });
      }
    },

    async discardDraft() {
      await clearDraft();
      set({ draft: null });
    },

    select: (nodeId) => set({ selection: nodeId }),

    toggleExpanded: (nodeId) =>
      set((state) => {
        const next = { ...state.expanded };
        if (next[nodeId]) delete next[nodeId];
        else next[nodeId] = true;
        return { expanded: next };
      }),

    setExpanded: (nodeId, open) =>
      set((state) => {
        if (open === Boolean(state.expanded[nodeId])) return state;
        const next = { ...state.expanded };
        if (open) next[nodeId] = true;
        else delete next[nodeId];
        return { expanded: next };
      }),

    expandTo: (nodeId) =>
      set((state) => {
        if (!state.model) return state;
        const next = { ...state.expanded };
        let current = state.model.nodes[nodeId]?.parent ?? null;
        while (current !== null) {
          next[current] = true;
          current = state.model.nodes[current]?.parent ?? null;
        }
        return { expanded: next };
      }),

    expandAll: (open) =>
      set((state) => {
        if (!state.model) return state;
        if (!open) return { expanded: { [state.model.rootId]: true } };
        const next: Record<NodeId, true> = {};
        for (const node of Object.values(state.model.nodes)) {
          if (Object.values(node.children).some((ids) => ids.length > 0)) next[node.nodeId] = true;
        }
        return { expanded: next };
      }),

    updateField: (nodeId, key, value) =>
      change(`${key} geaendert`, (draft) => setField(draft, nodeId, key, value)),

    addElement: (parentId, slot, kind, index) => {
      const { model } = get();
      if (!model) return;
      const before = model.nextNodeId;
      change(`${kind} angelegt`, (draft) => {
        insertNode(draft, parentId, slot, kind, index === undefined ? {} : { index });
      });
      // Die nodeId ist vorhersagbar, weil insertNode den Zaehler genau einmal erhoeht.
      const neu = `n${before}`;
      if (get().model?.nodes[neu]) {
        get().expandTo(neu);
        get().setExpanded(parentId, true);
        set({ selection: neu });
      }
    },

    deleteElement: (nodeId) => {
      const { model, selection } = get();
      if (!model) return;
      const parent = model.nodes[nodeId]?.parent ?? null;
      change("Element geloescht", (draft) => removeNode(draft, nodeId));
      if (selection === nodeId || (selection && !get().model?.nodes[selection])) {
        set({ selection: parent });
      }
    },

    duplicateElement: (nodeId) => {
      const { model } = get();
      if (!model) return;
      const before = model.nextNodeId;
      change("Element dupliziert", (draft) => duplicateNode(draft, nodeId));
      const kopie = `n${before}`;
      if (get().model?.nodes[kopie]) set({ selection: kopie });
    },

    moveElement: (nodeId, targetParentId, slot, index) => {
      change("Element verschoben", (draft) => moveNode(draft, nodeId, targetParentId, slot, index));
      get().setExpanded(targetParentId, true);
    },

    undo: () => {
      const { model, history } = get();
      if (!model) return;
      const step = undoModel(model, history);
      if (!step) return;
      set({ model: step.model, history: step.history, dirty: true });
      void aasWorker().applyPatches(step.patches);
      scheduleValidation(set);
      if (get().selection && !step.model.nodes[get().selection as NodeId]) {
        set({ selection: step.model.rootId });
      }
    },

    redo: () => {
      const { model, history } = get();
      if (!model) return;
      const step = redoModel(model, history);
      if (!step) return;
      set({ model: step.model, history: step.history, dirty: true });
      void aasWorker().applyPatches(step.patches);
      scheduleValidation(set);
      if (get().selection && !step.model.nodes[get().selection as NodeId]) {
        set({ selection: step.model.rootId });
      }
    },

    goToIssue: (issue) => {
      if (!issue.nodeId) return;
      get().expandTo(issue.nodeId);
      set((state) => ({
        selection: issue.nodeId,
        // Der Zaehler macht zwei Spruenge auf dasselbe Feld unterscheidbar, sonst
        // passierte beim zweiten Klick nichts.
        focusRequest: {
          nodeId: issue.nodeId as NodeId,
          field: issue.field,
          token: (state.focusRequest?.token ?? 0) + 1,
        },
      }));
    },

    goToNode: (nodeId) => {
      get().expandTo(nodeId);
      set({ selection: nodeId });
    },

    clearFocusRequest: () => set({ focusRequest: null }),
    setIssuePanelOpen: (open) => set({ issuePanelOpen: open }),
    setFilter: (filter) => set({ filter }),

    copyNode: (nodeId) => {
      const { model } = get();
      if (!model) return;
      try {
        set({ clipboard: copySubtree(model, nodeId) });
      } catch (error) {
        set({ error: (error as Error).message });
      }
    },

    cutNode: (nodeId) => {
      const { model } = get();
      if (!model) return;
      try {
        // Erst kopieren, dann loeschen. Faellt das Kopieren aus, bleibt alles stehen.
        const fragment = copySubtree(model, nodeId);
        set({ clipboard: fragment });
        get().deleteElement(nodeId);
      } catch (error) {
        set({ error: (error as Error).message });
      }
    },

    pasteInto: (parentId, slot, fragment, strategy = "neue-id") => {
      const { model } = get();
      if (!model) return null;

      const before = model.nextNodeId;
      let result: PasteResult | null = null;
      change("Eingefuegt", (draft) => {
        result = pasteSubtree(draft, parentId, slot, fragment, strategy);
      });

      const neu = `n${before}`;
      if (result && get().model?.nodes[neu]) {
        get().expandTo(neu);
        get().setExpanded(parentId, true);
        set({ selection: neu });
      }
      return result;
    },

    setDensity: (density) => set({ density }),
    setTheme: (theme) => set({ theme }),
    setView: (view) => set({ view }),

    pendingDeleteId: null,
    pasteTargetId: null,
    requestDelete: (nodeId) => set({ pendingDeleteId: nodeId }),
    requestPaste: (nodeId) => set({ pasteTargetId: nodeId }),

    async revalidate() {
      if (!get().model) return;
      // Der entprellte Lauf wuerde sonst gleich danach dasselbe noch einmal rechnen.
      clearTimeout(validateTimer);
      const lauf = ++validateLauf;
      set({ pruefung: "laeuft" });
      try {
        const issues = await aasWorker().validate();
        if (lauf === validateLauf) set({ issues, pruefung: "ruht" });
      } catch (error) {
        if (lauf === validateLauf) set({ pruefung: "ruht" });
        set({ error: (error as Error).message });
      }
    },

    graphZoom: 1,
    setGraphZoom: (graphZoom) => set({ graphZoom }),
  };
});

/**
 * Zugang fuer die Browser-Abnahme. Nur im Entwicklungsbetrieb, im Produktionsbundle
 * existiert dieser Zweig nicht: das Bearbeiten von aussen soll keine Angriffsflaeche sein.
 */
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>)["__aasEditorStore"] = useEditor;
}

/** Wurzel und Identifiables offen, alles darunter zu. Wie beim Oeffnen einer Datei. */
function aufgeklappteWurzel(model: EditorModel): Record<NodeId, true> {
  const expanded: Record<NodeId, true> = { [model.rootId]: true };
  for (const ids of Object.values(model.nodes[model.rootId]?.children ?? {})) {
    for (const id of ids) expanded[id] = true;
  }
  return expanded;
}

/** Hoechstens vier gleichzeitig, damit ein Modell mit vielen Anhaengen den Browser nicht flutet. */
async function inGruppen<T>(
  werte: readonly T[],
  arbeit: (wert: T) => Promise<void>,
): Promise<void> {
  const offen = [...werte];
  const laeufer = Array.from({ length: Math.min(4, offen.length) }, async () => {
    for (let naechster = offen.shift(); naechster !== undefined; naechster = offen.shift()) {
      await arbeit(naechster);
    }
  });
  await Promise.all(laeufer);
}

/**
 * Holt die Anhangs-Bytes vom Server in den Worker. Erst danach sind Validierung und
 * AASX-Export vollstaendig.
 */
async function anhaengeHolen(
  projektId: string,
  set: (partial: Partial<EditorState>) => void,
): Promise<void> {
  try {
    const { items } = await filesApi.list(projektId);
    await inGruppen(items, async (datei) => {
      const { bytes } = await filesApi.download(projektId, datei.id);
      await aasWorker().putAttachment(datei.path, datei.contentType, bytes);
    });
    set({
      anhaengeBereit: true,
      meta: {
        ...(useEditor.getState().meta as OpenMeta),
        attachments: items.map((datei) => ({
          path: datei.path,
          contentType: datei.contentType,
          size: datei.size,
        })),
      },
    });
  } catch {
    // Fehlende Anhaenge machen das Modell nicht unbrauchbar. Die Statusleiste zeigt
    // weiterhin, dass sie fehlen.
    set({ anhaengeBereit: true });
  }
}

/**
 * Laedt hoch, was der Server noch nicht hat oder was sich geaendert hat. Muss **vor** dem
 * Speichern des Modells laufen, sonst raeumt der Server Anhaenge weg, die er nicht kennt.
 */
async function anhaengeHochladen(projektId: string): Promise<void> {
  const [{ items }, lokal] = await Promise.all([
    filesApi.list(projektId),
    aasWorker().listAttachments(),
  ]);
  const bekannt = new Map(items.map((datei) => [datei.path, datei.sha256]));

  await inGruppen(lokal, async (info) => {
    const anhang = await aasWorker().getAttachment(info.path);
    if (anhang === null) return;
    const summe = await sha256Hex(anhang.bytes);
    if (bekannt.get(info.path) === summe) return;
    await filesApi.upload(projektId, info.path, anhang.contentType, anhang.bytes);
  });
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function renameTo(fileName: string, format: string): string {
  const base = fileName.replace(/\.(json|xml|aasx)$/i, "");
  return `${base}.${format}`;
}

// --- Abgeleitete Werte ---------------------------------------------------------------

export function nodeCount(model: EditorModel | null): number {
  return model ? countNodes(model) : 0;
}

export function nodeOf(model: EditorModel, nodeId: NodeId) {
  return getNode(model, nodeId);
}
