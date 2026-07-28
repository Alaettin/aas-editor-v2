import { toAasCore } from "../model/aasCore.js";
import { buildPathIndex, resolvePath } from "../model/paths.js";
import type { EditorModel, NodeId } from "../model/store.js";
import { findMissingAttachments } from "../io/attachments.js";
import { collectCollisionWarnings } from "../io/collisions.js";
import type { AttachmentMap } from "../io/types.js";
import { explain } from "./messages.js";

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
  /**
   * Verstaendlicher deutscher Satz. Faellt auf die Rohmeldung zurueck, wenn es keine
   * Uebersetzung gibt, siehe `translated`.
   */
  readonly title: string;
  /** Unveraenderte Meldung der Quelle, in der Oberflaeche aufklappbar */
  readonly message: string;
  /** Kennung wie AASd-131, sofern die Meldung eine traegt */
  readonly constraintId: string | null;
  readonly translated: boolean;
  readonly aasPath: string;
  readonly nodeId: NodeId | null;
  /** Feld innerhalb des Knotens, leer wenn der Fehler am Knoten selbst haengt */
  readonly field: string;
}

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
    const explanation = explain(error.message);
    issues.push({
      severity: "constraint",
      title: explanation.title,
      message: explanation.raw,
      constraintId: explanation.constraintId,
      translated: explanation.translated,
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
      // Die Datenwarnungen formuliert der Editor selbst, sie sind schon verstaendlich.
      title: warning.message,
      message: warning.message,
      constraintId: null,
      translated: true,
      aasPath,
      nodeId: location?.nodeId ?? null,
      field: location?.field ?? "",
    });
  }

  return issues;
}

/**
 * Das oberste Feld, an dem ein Befund haengt. `qualifiers[0].value` gehoert an den Block
 * `qualifiers`, sonst waere die Meldung nirgends sichtbar.
 */
export function topLevelField(field: string): string {
  if (field === "") return "";
  const cut = field.search(/[.[]/);
  return cut < 0 ? field : field.slice(0, cut);
}

export * from "./messages.js";
