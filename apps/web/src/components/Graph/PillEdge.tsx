import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { GraphEdgeKind } from "@aas-editor/core";

import { Chip } from "@/components/ui/chip";
import type { Tone } from "@/lib/typeOf";

/**
 * Kante mit Beschriftung als Pille.
 *
 * Eigener Kantentyp, weil die eingebauten Label-Optionen von React Flow keinen Rand
 * kennen: die Pille im Mockup hat eine typgetoente Umrandung, und die Beschriftung soll
 * die Kante nicht durchschneiden.
 */

const TON: Record<GraphEdgeKind, Tone> = {
  submodel: "sm",
  derivedFrom: "neutral",
  semanticId: "cd",
  relationship: "warn",
  reference: "neutral",
};

export function PillEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  data,
}: EdgeProps) {
  const [pfad, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const kind = data?.["kind"] as GraphEdgeKind | undefined;
  const count = (data?.["count"] as number | undefined) ?? 1;
  const ton = kind ? TON[kind] : "neutral";

  return (
    <>
      <BaseEdge id={id} path={pfad} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          className="pointer-events-none absolute flex items-center gap-1"
        >
          <Chip tone={ton} fill="outline" pill mono className="bg-card">
            {kind}
          </Chip>
          {count > 1 ? (
            <Chip tone={ton} fill="solid" pill mono data-numeric>
              ×{count}
            </Chip>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
