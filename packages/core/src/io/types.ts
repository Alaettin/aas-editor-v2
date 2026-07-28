import type { EditorModel } from "../model/store.js";
import type { UpgradeNote } from "../upgrade/v30ToV31.js";

export type AasFormat = "json" | "xml" | "aasx";
export type MetamodelVersion = "3.0" | "3.1" | "unbekannt";

/**
 * Ein Supplementary File eines AASX-Pakets.
 *
 * File-Elemente tragen im Modell nur einen Paketpfad, nicht den Inhalt. Ohne diesen
 * zweiten Speicher gehen beim AASX-Roundtrip alle Anhaenge verloren (Plan Abschnitt 5).
 */
export interface Attachment {
  /** Paketpfad, wie ihn ein File-Element traegt, etwa "/aasx/files/handbuch.pdf" */
  readonly path: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

/** Pfad auf Bytes. Lebt neben dem Modell, nicht darin. */
export type AttachmentMap = ReadonlyMap<string, Attachment>;

export interface ImportWarning {
  readonly kind: "fehlender-anhang" | "kollision" | "unbekannter-teil";
  readonly message: string;
  /** aas-core-Pfad, wo vorhanden */
  readonly path?: string;
}

export interface ImportResult {
  readonly model: EditorModel;
  readonly format: AasFormat;
  /** Erkannte Version der Quelldatei, nicht die des Ergebnisses. Das ist immer 3.1. */
  readonly sourceVersion: MetamodelVersion;
  readonly attachments: AttachmentMap;
  readonly thumbnail: Attachment | null;
  readonly upgradeNotes: readonly UpgradeNote[];
  readonly warnings: readonly ImportWarning[];
}

export interface ExportOptions {
  readonly attachments?: AttachmentMap;
  readonly thumbnail?: Attachment | null;
}

/** Fehler beim Lesen einer Datei, immer mit lesbarer Meldung und wo moeglich mit Pfad. */
export class ImportError extends Error {
  readonly path: string | undefined;

  constructor(message: string, path?: string) {
    super(path ? `${message} (bei ${path})` : message);
    this.name = "ImportError";
    this.path = path;
  }
}
