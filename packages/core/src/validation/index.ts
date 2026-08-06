import type { Werte } from "../fehler.js";
import { toAasCore } from "../model/aasCore.js";
import { buildPathIndex, resolvePath } from "../model/paths.js";
import type { EditorModel, NodeId } from "../model/store.js";
import { findMissingAttachments, type Anhangspfade } from "../io/attachments.js";
import { collectCollisionWarnings } from "../io/collisions.js";
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
   * i18n-Schluessel des verstaendlichen Satzes. `null` heisst: keine Uebersetzung
   * gefunden, dann zeigt die Oberflaeche `message`. Der Kern kennt keine Sprache.
   */
  readonly schluessel: string | null;
  /** Werte fuer die Interpolation des Schluessels */
  readonly werte: Werte;
  /** Unveraenderte Meldung der Quelle, in der Oberflaeche aufklappbar. Immer englisch. */
  readonly message: string;
  /** Kennung wie AASd-131, sofern die Meldung eine traegt */
  readonly constraintId: string | null;
  readonly aasPath: string;
  readonly nodeId: NodeId | null;
  /** Feld innerhalb des Knotens, leer wenn der Fehler am Knoten selbst haengt */
  readonly field: string;
}

/**
 * `attachments` ist nur eine Auskunft darueber, welche Paketpfade es gibt: der Worker
 * reicht seine `AttachmentMap` durch, der Server ein `Set` aus der Datenbank. Wer hier
 * nichts uebergibt, bekommt jedes File-Element als fehlenden Anhang gemeldet.
 */
export async function validate(
  model: EditorModel,
  attachments: Anhangspfade = new Set<string>(),
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
      schluessel: explanation.schluessel,
      werte: explanation.werte,
      message: explanation.raw,
      constraintId: explanation.constraintId,
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
      // Die Datenwarnungen formuliert der Editor selbst, sie tragen deshalb ihren
      // Schluessel schon mit. `message` bleibt leer: es gibt keine fremde Rohmeldung,
      // hinter der mehr staende.
      schluessel: warning.schluessel,
      werte: warning.werte,
      message: "",
      constraintId: null,
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
