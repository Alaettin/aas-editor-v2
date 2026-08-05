import { buildPathIndex } from "../model/paths.js";
import { walk, type EditorModel } from "../model/store.js";
import type { Attachment, AttachmentMap, ImportWarning } from "./types.js";

/**
 * Der zweite Speicher neben dem Modell: Paketpfad auf Bytes (Plan Abschnitt 5).
 *
 * Ein Blob-Element traegt seinen Inhalt selbst und ueberlebt jeden Export. Ein
 * File-Element traegt nur einen Pfad in den Paketcontainer. Ohne diese Map gehen dessen
 * Inhalte beim AASX-Roundtrip verloren.
 */

export function emptyAttachments(): AttachmentMap {
  return new Map();
}

export function withAttachment(map: AttachmentMap, attachment: Attachment): AttachmentMap {
  const next = new Map(map);
  next.set(normalizePath(attachment.path), attachment);
  return next;
}

export function withoutAttachment(map: AttachmentMap, path: string): AttachmentMap {
  const next = new Map(map);
  next.delete(normalizePath(path));
  return next;
}

/** Paketpfade sind absolut. Ein fehlender fuehrender Schraegstrich ist ein haeufiger Tippfehler. */
export function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export interface FileReference {
  readonly nodeId: string;
  readonly path: string;
  /** aas-core-Pfad des Elements, fuer den Sprung aus der Warnung */
  readonly aasPath: string;
}

/** Alle File-Elemente des Modells mit ihrem Paketpfad. */
export function collectFileReferences(model: EditorModel): FileReference[] {
  const index = buildPathIndex(model);
  const out: FileReference[] = [];

  for (const node of walk(model)) {
    if (node.kind !== "File") continue;
    const value = node.data["value"];
    if (typeof value !== "string" || value.length === 0) continue;
    // Externe Verweise sind kein Paketanhang und werden nicht geprueft.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) continue;

    out.push({
      nodeId: node.nodeId,
      path: normalizePath(value),
      aasPath: index.byNode.get(node.nodeId) ?? "",
    });
  }

  return out;
}

/**
 * File-Elemente, deren Pfad auf keinen vorhandenen Anhang zeigt.
 * Das ist keine Metamodell-Verletzung, sondern ein Datenfehler, und wird laut
 * Plan Abschnitt 5 klar als Warnung gefuehrt.
 */
export function findMissingAttachments(
  model: EditorModel,
  attachments: AttachmentMap,
): ImportWarning[] {
  return collectFileReferences(model)
    .filter((reference) => !attachments.has(reference.path))
    .map((reference) => ({
      kind: "fehlender-anhang" as const,
      schluessel: "warnung.fehlenderAnhang",
      werte: { pfad: reference.path },
      path: reference.aasPath,
    }));
}
