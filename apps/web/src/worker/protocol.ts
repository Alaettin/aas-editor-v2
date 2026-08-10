import type { EditorModel, Patch, UpgradeNote } from "@aas-editor/core";
import type { AasFormat, ImportWarning, MetamodelVersion } from "@aas-editor/core/io/types";
import type { ValidationIssue } from "@aas-editor/core/validation";

/**
 * Vertrag zwischen Hauptthread und Worker.
 *
 * Das vollstaendige Modell geht genau einmal ueber die Bruecke, beim Oeffnen. Danach
 * fliessen nur noch Immer-Patches hinein und Fehlerlisten heraus, damit der Datenverkehr
 * unabhaengig von der Modellgroesse konstant bleibt (Plan Abschnitt 4).
 */

export interface AttachmentInfo {
  readonly path: string;
  readonly contentType: string;
  readonly size: number;
}

export interface AttachmentBytes {
  readonly path: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

export interface OpenResult {
  readonly model: EditorModel;
  readonly format: AasFormat;
  readonly sourceVersion: MetamodelVersion;
  readonly attachments: readonly AttachmentInfo[];
  readonly hasThumbnail: boolean;
  readonly upgradeNotes: readonly UpgradeNote[];
  readonly warnings: readonly ImportWarning[];
}

export type { ValidationIssue };

export interface ExportedFile {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly contentType: string;
}

export interface AasWorkerApi {
  open(bytes: Uint8Array, fileName?: string): Promise<OpenResult>;
  /**
   * Setzt den Spiegel auf ein fertiges Modell. Gebraucht beim Wiederherstellen eines
   * Entwurfs aus IndexedDB: der Worker hat ihn nie gesehen. Der einzige Fall neben dem
   * Oeffnen, in dem das Vollmodell ueber die Bruecke geht.
   */
  setModel(model: EditorModel): Promise<void>;
  applyPatches(patches: readonly Patch[]): Promise<void>;
  validate(): Promise<readonly ValidationIssue[]>;
  exportAs(format: AasFormat): Promise<ExportedFile>;

  /**
   * Zugang zu den Anhangs-Bytes, die sonst ausschliesslich hier liegen.
   *
   * Gebraucht fuer die Serverablage: beim Speichern werden sie einzeln geholt und
   * hochgeladen, beim Laden einzeln zurueckgelegt. Sie wandern bewusst nicht als Ganzes
   * ueber die Bruecke, eine AASX kann zweistellig viele Megabyte tragen.
   */
  listAttachments(): Promise<readonly AttachmentInfo[]>;
  getAttachment(path: string): Promise<AttachmentBytes | null>;
  putAttachment(path: string, contentType: string, bytes: Uint8Array): Promise<void>;
  removeAttachment(path: string): Promise<void>;

  /**
   * Das Paket-Thumbnail, falls die geoeffnete Datei eines mitgebracht hat.
   *
   * Es liegt **neben** den Anhaengen, nicht in ihnen: ein AASX fuehrt es als eigenen
   * OPC-Teil in der Wurzel, nicht als Supplementary File. `OpenResult.hasThumbnail` sagt
   * nur, ob es eines gibt; wer es anzeigen will, braucht die Bytes.
   */
  getThumbnail(): Promise<AttachmentBytes | null>;

  /** Nur fuer die Testseite und Diagnose */
  nodeCount(): Promise<number>;
}
