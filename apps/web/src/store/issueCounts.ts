import type { EditorModel, NodeId } from "@aas-editor/core";
import type { ValidationIssue } from "@aas-editor/core/validation";

/**
 * Befunde je Knoten, aufsummiert entlang der Elternkette.
 *
 * Ein zugeklappter Container zeigt damit die Summe seines Teilbaums. Die Aggregation lag
 * frueher im Baum; Tabelle, Graph und Formularfuss brauchen dieselbe Zahl, also gibt es
 * sie genau einmal.
 */

export interface IssueCount {
  readonly errors: number;
  readonly warnings: number;
}

export type IssueCounts = ReadonlyMap<NodeId, IssueCount>;

export const KEINE_BEFUNDE: IssueCounts = new Map();

export function buildIssueCounts(
  model: EditorModel | null,
  issues: readonly ValidationIssue[],
): IssueCounts {
  const counts = new Map<NodeId, { errors: number; warnings: number }>();
  if (!model) return counts;

  for (const issue of issues) {
    if (!issue.nodeId) continue;
    let current: NodeId | null = issue.nodeId;
    while (current !== null) {
      const eintrag = counts.get(current) ?? { errors: 0, warnings: 0 };
      if (issue.severity === "constraint") eintrag.errors += 1;
      else eintrag.warnings += 1;
      counts.set(current, eintrag);
      current = model.nodes[current]?.parent ?? null;
    }
  }

  return counts;
}

/** Befunde genau an diesem Knoten, ohne Teilbaum. */
export function issuesAt(
  issues: readonly ValidationIssue[],
  nodeId: NodeId | null,
): readonly ValidationIssue[] {
  if (nodeId === null) return [];
  return issues.filter((issue) => issue.nodeId === nodeId);
}
