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
  /** Woher der Verweis stammt: ein File-Element oder das Vorschaubild einer Schale. */
  readonly art: "datei" | "vorschaubild";
}

/** Externe Verweise sind kein Paketanhang und werden nirgends geprueft. */
const IST_EXTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

function alsPaketpfad(wert: unknown): string | null {
  if (typeof wert !== "string" || wert.length === 0) return null;
  if (IST_EXTERN.test(wert)) return null;
  return normalizePath(wert);
}

/** Alle File-Elemente des Modells mit ihrem Paketpfad. */
export function collectFileReferences(model: EditorModel): FileReference[] {
  const index = buildPathIndex(model);
  const out: FileReference[] = [];

  for (const node of walk(model)) {
    if (node.kind !== "File") continue;
    const path = alsPaketpfad(node.data["value"]);
    if (path === null) continue;

    out.push({
      nodeId: node.nodeId,
      path,
      aasPath: index.byNode.get(node.nodeId) ?? "",
      art: "datei",
    });
  }

  return out;
}

/**
 * Das `defaultThumbnail` jeder Schale, sofern es in den Paketcontainer zeigt.
 *
 * Die zweite Quelle neben den File-Elementen. Sie zu uebersehen war der Grund, aus dem ein
 * ersetztes Produktbild am 10.08.2026 stillschweigend auch das Vorschaubild aenderte: in
 * echten Herstellerdateien zeigen beide auf **dieselbe** Datei.
 */
export function collectThumbnailReferences(model: EditorModel): FileReference[] {
  const index = buildPathIndex(model);
  const out: FileReference[] = [];

  for (const node of walk(model)) {
    if (node.kind !== "AssetAdministrationShell") continue;
    const info = node.data["assetInformation"];
    if (typeof info !== "object" || info === null || Array.isArray(info)) continue;
    const thumb = (info as Record<string, unknown>)["defaultThumbnail"];
    if (typeof thumb !== "object" || thumb === null || Array.isArray(thumb)) continue;
    const path = alsPaketpfad((thumb as Record<string, unknown>)["path"]);
    if (path === null) continue;

    out.push({
      nodeId: node.nodeId,
      path,
      aasPath: index.byNode.get(node.nodeId) ?? "",
      art: "vorschaubild",
    });
  }

  return out;
}

/**
 * Alles, was auf eine Datei im Paket zeigt.
 *
 * Die Grundlage der Frage "teilen sich mehrere Stellen diese Datei?". Ein Pfad kann hier
 * mehrfach vorkommen, genau das ist der interessante Fall.
 */
export function collectPackageReferences(model: EditorModel): FileReference[] {
  return [...collectFileReferences(model), ...collectThumbnailReferences(model)];
}

/**
 * Alles, was diese Pruefung von den Anhaengen wissen muss: ob es einen Pfad gibt.
 *
 * Bewusst ein Strukturtyp und keine `AttachmentMap`. Eine `AttachmentMap` erfuellt ihn
 * weiterhin, aber auch ein blosses `Set<string>` — und genau das hat der Server: er kennt
 * die Pfade seiner Anhaenge aus der Datenbank, ihre Bytes liegen aber auf der Platte und
 * werden hier nie gebraucht. Die Alternative waere eine Map mit erfundenen leeren Bytes.
 */
export interface Anhangspfade {
  has(pfad: string): boolean;
}

/**
 * File-Elemente, deren Pfad auf keinen vorhandenen Anhang zeigt.
 * Das ist keine Metamodell-Verletzung, sondern ein Datenfehler, und wird laut
 * Plan Abschnitt 5 klar als Warnung gefuehrt.
 */
export function findMissingAttachments(
  model: EditorModel,
  attachments: Anhangspfade,
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
