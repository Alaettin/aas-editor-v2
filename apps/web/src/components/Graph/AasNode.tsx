import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, FileText, Tag } from "lucide-react";

import { cn } from "@/lib/utils";
import { shortenMiddle } from "@/store/rows";

/**
 * Ein Knoten der Beziehungskarte. Je Identifiable-Art ein eigenes Zeichen und eine eigene
 * Bedeutungsfarbe, alles aus den Tokens.
 *
 * Die Anschlusspunkte sind unsichtbar und nicht verbindbar: die Karte ist zum Lesen, nicht
 * zum Verdrahten (Plan Abschnitt 8).
 */

const SYMBOL = {
  AssetAdministrationShell: Box,
  Submodel: FileText,
  ConceptDescription: Tag,
} as const;

const FARBE = {
  AssetAdministrationShell: "border-primary",
  Submodel: "border-border-strong",
  ConceptDescription: "border-success",
} as const;

type Kind = keyof typeof SYMBOL;

export const AasNode = memo(function AasNode({ data }: NodeProps) {
  const kind = data["kind"] as Kind;
  const label = data["label"] as string;
  const aasId = data["aasId"] as string | null;
  const selected = data["selected"] === true;
  const Symbol = SYMBOL[kind] ?? FileText;

  return (
    <div
      data-graph-node
      title={aasId ?? label}
      className={cn(
        "flex w-[200px] flex-col gap-0.5 rounded-md border-2 bg-card px-2.5 py-1.5 shadow-(--shadow-raised)",
        FARBE[kind] ?? "border-border",
        selected && "ring-2 ring-ring",
      )}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="opacity-0" />

      <div className="flex items-center gap-1.5">
        <Symbol className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-xs font-medium">{label}</span>
      </div>
      <span className="truncate font-mono text-2xs text-muted-foreground">
        {aasId ? shortenMiddle(aasId, 28) : kind}
      </span>

      <Handle type="source" position={Position.Right} isConnectable={false} className="opacity-0" />
    </div>
  );
});
