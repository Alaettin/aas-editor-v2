import { toAasCore } from "./model/aasCore.js";
import { buildPathIndex, resolvePath } from "./model/paths.js";
import type { EditorModel, NodeId } from "./model/store.js";
import { findMissingAttachments } from "./io/attachments.js";
import { collectCollisionWarnings } from "./io/collisions.js";
import type { AttachmentMap } from "./io/types.js";

/**
 * Live-Validierung (Plan Abschnitt 7).
 *
 * Quelle der Metamodell-Fehler ist ausschliesslich `verification.verify()`. Es gibt keine
 * handgeschriebenen Constraint-Regeln, sonst weicht der Editor vom Metamodell ab.
 * Die zusaetzlichen Datenwarnungen (fehlender Anhang, doppelte id) sind klar als Warnung
 * gekennzeichnet und niemals als Constraint.
 *
 * `verification` ist 213 KB roh und wird deshalb nur hier und nur dynamisch geladen.
 * Dieses Modul gehoert in den Worker.
 */

export interface ValidationIssue {
  readonly severity: "constraint" | "warnung";
  readonly message: string;
  /** Kennung wie AASd-131, sofern die Meldung eine traegt */
  readonly constraintId: string | null;
  readonly aasPath: string;
  readonly nodeId: NodeId | null;
  /** Feld innerhalb des Knotens, leer wenn der Fehler am Knoten selbst haengt */
  readonly field: string;
}

const CONSTRAINT_PATTERN = /\b(AAS[dc]-[0-9A-Za-z-]+)\b/;

export async function validate(
  model: EditorModel,
  attachments: AttachmentMap = new Map(),
): Promise<ValidationIssue[]> {
  const verification = await import("@aas-core-works/aas-core3.1-typescript/verification");

  const index = buildPathIndex(model);
  const issues: ValidationIssue[] = [];

  for (const error of verification.verify(toAasCore(model))) {
    const aasPath = String(error.path);
    const location = resolvePath(index, aasPath);
    issues.push({
      severity: "constraint",
      message: error.message,
      constraintId: CONSTRAINT_PATTERN.exec(error.message)?.[1] ?? null,
      aasPath,
      nodeId: location?.nodeId ?? null,
      field: location?.field ?? "",
    });
  }

  for (const warning of [
    ...findMissingAttachments(model, attachments),
    ...collectCollisionWarnings(model),
  ]) {
    const aasPath = warning.path ?? "";
    const location = resolvePath(index, aasPath);
    issues.push({
      severity: "warnung",
      message: warning.message,
      constraintId: null,
      aasPath,
      nodeId: location?.nodeId ?? null,
      field: location?.field ?? "",
    });
  }

  return issues;
}
