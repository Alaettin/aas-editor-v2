import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { nodeSize, type GraphNodeKind } from "@aas-editor/core";

import { Chip } from "@/components/ui/chip";
import { shortKind, toneOf } from "@/lib/typeOf";
import { cn } from "@/lib/utils";
import { shortenMiddle } from "@/store/rows";

/**
 * Eine Karte der Beziehungskarte.
 *
 * Die Typfarbe sitzt als 4px breite linke Kante, nicht als Rahmen ringsum: sie soll auf
 * einen Blick die Art zeigen, ohne mit der Auswahlmarkierung zu konkurrieren.
 *
 * Die Breite kommt aus `nodeSize` im Kern, weil dieselbe Zahl im Worker das elkjs-Layout
 * rechnet. Zwei getrennte Zahlen wuerden Kanten ueber die Karten legen.
 *
 * Die Anschlusspunkte sind unsichtbar und nicht verbindbar: die Karte ist zum Lesen, nicht
 * zum Verdrahten (Plan Abschnitt 8).
 */

const KANTE: Record<GraphNodeKind, string> = {
  AssetAdministrationShell: "border-l-type-aas",
  Submodel: "border-l-type-sm",
  ConceptDescription: "border-l-type-cd",
};

export const AasNode = memo(function AasNode({ data }: NodeProps) {
  const { t } = useTranslation();
  const kind = data["kind"] as GraphNodeKind;
  const label = data["label"] as string;
  const aasId = data["aasId"] as string | null;
  const childCount = (data["childCount"] as number | undefined) ?? 0;
  const issueCount = (data["issueCount"] as number | undefined) ?? 0;
  const selected = data["selected"] === true;
  const masse = nodeSize(kind);
  const klein = kind === "ConceptDescription";

  return (
    <div
      data-graph-node
      title={aasId ?? label}
      style={{ width: masse.width, height: masse.height }}
      className={cn(
        // Glas statt Vollton: die Karte liegt auf der Buehne, und der Verlauf soll
        // durchscheinen. Kantig ist sie ueber die Radienleiter in tokens.css.
        "flex flex-col justify-center overflow-hidden border border-l-[3px] bg-card shadow-(--shadow-raised) backdrop-blur-(--blur-knoten)",
        klein ? "px-2.5 py-2" : "px-3 py-2.5",
        KANTE[kind],
        // Der gewaehlte Knoten atmet leise, statt einen dicken Ring zu tragen.
        selected && "border-ring [animation:axon-knoten_4.2s_ease-in-out_infinite]",
      )}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="opacity-0" />

      <div className="flex items-center gap-1.5">
        {klein ? null : (
          <Chip tone={toneOf(kind)} mono>
            {shortKind(kind)}
          </Chip>
        )}
        <span className={cn("truncate font-semibold", klein ? "text-xs" : "text-base")}>
          {label}
        </span>
      </div>

      <span className="mt-0.5 truncate font-mono text-2xs text-mono-foreground">
        {aasId ? shortenMiddle(aasId, klein ? 26 : 32) : kind}
      </span>

      {klein ? null : (
        <div className="mt-1 flex items-center gap-2 text-2xs">
          <span className="text-muted-foreground" data-numeric>
            {kind === "AssetAdministrationShell"
              ? t("graph.submodels", { count: childCount })
              : t("graph.elemente", { count: childCount })}
          </span>
          {issueCount > 0 ? (
            <span className="font-medium text-warning-text" data-numeric>
              {t("graph.befunde", { count: issueCount })}
            </span>
          ) : null}
        </div>
      )}

      <Handle type="source" position={Position.Right} isConnectable={false} className="opacity-0" />
    </div>
  );
});
