import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  buildGraph,
  GRAPH_LIMIT,
  neighborhood,
  type GraphEdgeKind,
  type GraphNodeKind,
  type LayoutResult,
} from "@aas-editor/core";

import { Maximize2, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { TypeDot } from "@/components/ui/type-dot";
import { toneOf } from "@/lib/typeOf";
import { useEditor } from "@/store/editor";
import { buildIssueCounts } from "@/store/issueCounts";
import { aasWorker } from "@/worker/bridge";
import { AasNode } from "./AasNode";
import { PillEdge } from "./PillEdge";

/** Die Minikarte kennt keine Klassen, sie bekommt die Farbe je Art direkt. */
const MINIMAP_FARBE: Record<GraphNodeKind, string> = {
  AssetAdministrationShell: "var(--type-aas)",
  Submodel: "var(--type-sm)",
  ConceptDescription: "var(--type-cd)",
};

/**
 * Die Beziehungskarte (Plan Abschnitt 8).
 *
 * Bewusst **zum Lesen und Navigieren, kein Verdrahten**: es lassen sich keine Kanten
 * ziehen und keine Verbindungen anlegen. Wer etwas aendern will, tut das im Formular.
 *
 * Das Layout rechnet der Worker mit elkjs, nicht der Hauptthread. Diese Datei wird ueber
 * React.lazy geladen, `@xyflow/react` sind 88 KB gzip.
 */

const nodeTypes = { aas: AasNode };
const edgeTypes = { pille: PillEdge };

/**
 * Kantenstile aus den Tokens. Nicht nur die Farbe traegt Bedeutung, auch Breite und
 * Deckkraft: eine gebuendelte Kante ist dicker, eine semanticId-Kante zurueckhaltender als
 * die tragende submodel-Kante.
 */
const EDGE_STYLE: Record<GraphEdgeKind, { farbe: string; breite: number; deckkraft: number }> = {
  submodel: { farbe: "var(--type-sm)", breite: 2, deckkraft: 1 },
  derivedFrom: { farbe: "var(--muted-foreground)", breite: 1.5, deckkraft: 0.8 },
  semanticId: { farbe: "var(--type-cd)", breite: 1.5, deckkraft: 0.75 },
  relationship: { farbe: "var(--warning)", breite: 1.5, deckkraft: 0.9 },
  reference: { farbe: "var(--muted-foreground)", breite: 1.5, deckkraft: 0.8 },
};

export default function GraphView() {
  return (
    <ReactFlowProvider>
      <GraphInner />
    </ReactFlowProvider>
  );
}

function GraphInner() {
  const { t } = useTranslation();
  const model = useEditor((state) => state.model);
  const selection = useEditor((state) => state.selection);
  const issues = useEditor((state) => state.issues);
  const goToNode = useEditor((state) => state.goToNode);
  const setGraphZoom = useEditor((state) => state.setGraphZoom);

  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  /** Zaehlt jeden Anlauf von Hand. Ohne ihn liefe der Effekt bei gleicher Signatur nie erneut. */
  const [versuch, setVersuch] = useState(0);
  const [allesZeigen, setAllesZeigen] = useState(false);
  const { fitView, setCenter, zoomIn, zoomOut } = useReactFlow();

  const befunde = useMemo(() => buildIssueCounts(model, issues), [model, issues]);

  const voll = useMemo(() => (model ? buildGraph(model) : null), [model]);

  /** Bei sehr grossen Modellen nur die Nachbarschaft der Auswahl (Plan Abschnitt 11). */
  const graph = useMemo(() => {
    if (!voll) return null;
    if (allesZeigen || voll.nodes.length <= GRAPH_LIMIT) return voll;
    if (!selection) return voll;
    const beschnitten = neighborhood(voll, selection, 2);
    return beschnitten.nodes.length > 0 ? beschnitten : voll;
  }, [voll, allesZeigen, selection]);

  const beschnitten = Boolean(voll && graph && graph.nodes.length < voll.nodes.length);

  /**
   * Alles, was die Karte sichtbar veraendert: Knoten, ihre Beschriftung, ihr Bestand und
   * die Kanten. Eine Aenderung tief in einem Teilmodell laesst das unberuehrt und darf
   * deshalb kein neues Layout ausloesen. Vorher rechnete elk nach jedem Tastendruck.
   */
  const signatur = useMemo(() => {
    if (!graph) return "";
    const knoten = graph.nodes.map((n) => `${n.id}:${n.label}:${String(n.childCount)}`).join("|");
    const kanten = graph.edges.map((e) => `${e.id}:${String(e.count)}`).join("|");
    return `${knoten}##${kanten}`;
  }, [graph]);

  const gerechneteSignatur = useRef<string | null>(null);

  useEffect(() => {
    if (!graph || signatur === gerechneteSignatur.current) return;
    let abgebrochen = false;

    setLaedt(true);
    setFehler(null);
    // Kurz warten: waehrend des Tippens aendert sich eine Beschriftung mehrfach, und jedes
    // Layout waere Arbeit fuer einen Zustand, den niemand sieht.
    const timer = setTimeout(() => {
      gerechneteSignatur.current = signatur;
      aasWorker()
        .layoutGraph(graph)
        .then((ergebnis) => {
          if (abgebrochen) return;
          setLayout(ergebnis);
          setLaedt(false);
        })
        .catch((error: unknown) => {
          if (abgebrochen) return;
          gerechneteSignatur.current = null;
          setFehler((error as Error).message);
          setLaedt(false);
        });
    }, 250);

    return () => {
      abgebrochen = true;
      clearTimeout(timer);
    };
  }, [graph, signatur, versuch]);

  const nodes = useMemo<Node[]>(() => {
    if (!layout) return [];
    return layout.nodes.map((node) => ({
      id: node.id,
      type: "aas",
      position: { x: node.x, y: node.y },
      data: {
        label: node.label,
        kind: node.kind,
        aasId: node.aasId,
        childCount: node.childCount,
        issueCount: (befunde.get(node.id)?.errors ?? 0) + (befunde.get(node.id)?.warnings ?? 0),
        selected: node.id === selection,
      },
      draggable: false,
      connectable: false,
    }));
  }, [layout, selection, befunde]);

  const edges = useMemo<Edge[]>(() => {
    if (!graph) return [];
    return graph.edges.map((edge) => {
      const stil = EDGE_STYLE[edge.kind];
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "pille",
        animated: false,
        data: { kind: edge.kind, count: edge.count },
        style: {
          stroke: stil.farbe,
          // Die Buendelstaerke steckt in der Strichbreite, so wie im Mockup.
          strokeWidth: edge.count > 1 ? 3 : stil.breite,
          opacity: edge.count > 1 ? 0.85 : stil.deckkraft,
        },
      } satisfies Edge;
    });
  }, [graph]);

  /**
   * Nach einem frischen Layout wird einmal eingepasst, danach folgt die Ansicht der
   * Auswahl. Ohne diese Reihenfolge kaempfen beide gegeneinander, und der Graph landet
   * angeschnitten am Bildrand.
   */
  const [eingepasst, setEingepasst] = useState(false);

  useEffect(() => setEingepasst(false), [layout]);

  useEffect(() => {
    if (!layout || laedt || eingepasst) return;
    void fitView({ duration: 200, padding: 0.2 });
    setEingepasst(true);
  }, [layout, laedt, eingepasst, fitView]);

  useEffect(() => {
    if (!layout || !eingepasst || !selection) return;
    const treffer = layout.nodes.find((node) => node.id === selection);
    if (!treffer) return;
    setCenter(treffer.x + treffer.width / 2, treffer.y + treffer.height / 2, {
      zoom: 1,
      duration: 200,
    });
  }, [selection, layout, eingepasst, setCenter]);

  const onNodeClick = useCallback((_: unknown, node: Node) => goToNode(node.id), [goToNode]);

  if (!graph || graph.nodes.length === 0) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyTitle>{t("graph.leerTitel")}</EmptyTitle>
          <EmptyDescription>{t("graph.leerText")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="relative h-full">
      {laedt ? (
        <div className="absolute inset-0 z-10 flex flex-col gap-2 bg-background/80 p-4">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-full w-full" />
        </div>
      ) : null}

      {fehler ? (
        // `role="alert"` fehlte: der Streifen war fuer einen Bildschirmleser stumm. Dazu
        // ein Weg zurueck, statt den Nutzer vor einem toten Bild sitzen zu lassen.
        <div
          role="alert"
          className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 bg-destructive px-3 py-2 text-sm text-destructive-foreground"
        >
          <span className="min-w-0 flex-1">{fehler}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              gerechneteSignatur.current = null;
              setFehler(null);
              setVersuch((n) => n + 1);
            }}
          >
            {t("graph.erneut")}
          </Button>
        </div>
      ) : null}

      <div className="absolute top-3 right-3.5 z-10 flex items-center gap-2 rounded-lg border border-border bg-card/90 px-2.5 py-1 font-mono text-xs">
        <span data-graph-stats data-numeric>
          {t("graph.umfang", { knoten: graph.nodes.length, kanten: graph.edges.length })}
        </span>
        {layout ? (
          <span className="text-muted-foreground" data-graph-duration>
            {t("graph.dauer", { ms: Math.round(layout.durationMs) })}
          </span>
        ) : null}
        {beschnitten ? (
          <Button variant="outline" size="sm" onClick={() => setAllesZeigen(true)}>
            {t("graph.allesZeigen", { count: voll?.nodes.length ?? 0 })}
          </Button>
        ) : null}
      </div>

      {/* Eigener Zoomstapel: die mitgelieferten Controls bringen ihr eigenes Stylesheet mit. */}
      <div className="absolute bottom-3.5 left-[196px] z-10 flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <button
          type="button"
          aria-label={t("graph.zoomRein")}
          onClick={() => void zoomIn({ duration: 150 })}
          className="border-b border-border-subtle px-2.5 py-1 hover:bg-accent"
        >
          <Plus className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={t("graph.zoomRaus")}
          onClick={() => void zoomOut({ duration: 150 })}
          className="border-b border-border-subtle px-2.5 py-1 hover:bg-accent"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={t("graph.einpassen")}
          onClick={() => void fitView({ duration: 200, padding: 0.2 })}
          className="px-2.5 py-1 hover:bg-accent"
        >
          <Maximize2 className="size-3" />
        </button>
      </div>

      {/* Legende: der Farbcode gilt in allen Sichten, hier steht er ausgeschrieben. */}
      <div className="absolute bottom-3.5 left-3.5 z-10 flex flex-col gap-1.5 rounded-2xl border border-border bg-card/95 px-3 py-2.5 text-xs">
        {(["AssetAdministrationShell", "Submodel", "ConceptDescription"] as const).map((kind) => (
          <span key={kind} className="flex items-center gap-2">
            <TypeDot tone={toneOf(kind)} />
            {kind}
          </span>
        ))}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onMove={(_, viewport) => setGraphZoom(viewport.zoom)}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        proOptions={{ hideAttribution: true }}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--graph-grid)" />
        <MiniMap
          pannable
          zoomable
          className="rounded-xl border border-border"
          style={{ width: 150, height: 96, background: "var(--card)" }}
          maskColor="color-mix(in oklab, var(--background), transparent 40%)"
          // Das Sichtfeldrechteck zeichnet xyflow aus seinem eigenen Stylesheet, mit
          // einem festen Grau. Ohne diese beiden Zeilen ist es im Dunkelmodus die einzige
          // Flaeche, die der Rampe nicht folgt.
          maskStrokeColor="var(--primary)"
          maskStrokeWidth={3}
          nodeColor={(node) => MINIMAP_FARBE[node.data["kind"] as GraphNodeKind] ?? "var(--border)"}
          nodeStrokeColor="var(--card)"
        />
      </ReactFlow>
    </div>
  );
}
