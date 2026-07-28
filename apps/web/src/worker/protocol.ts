import type { EditorModel, Graph, LayoutResult, Patch, UpgradeNote } from "@aas-editor/core";
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
   * Berechnet das Graph-Layout. elkjs (456 KB gzip) wird dabei erst geladen, wenn der
   * Graph das erste Mal geoeffnet wird, und rechnet hier statt im Hauptthread
   * (Plan Abschnitt 11).
   */
  layoutGraph(graph: Graph): Promise<LayoutResult>;
  /** Nur fuer die Testseite und Diagnose */
  nodeCount(): Promise<number>;
}
