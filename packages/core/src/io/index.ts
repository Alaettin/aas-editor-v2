import { fromAasCore, toAasCore } from "../model/aasCore.js";
import type { EditorModel } from "../model/store.js";

import { exportAasx, importAasx } from "./aasx.js";
import { findMissingAttachments } from "./attachments.js";
import { collectCollisionWarnings } from "./collisions.js";
import { decodeText, detectFormat, detectVersion } from "./detect.js";
import { exportJson, importJson } from "./json.js";
import { exportXml, importXml } from "./xml.js";
import type {
  AasFormat,
  Attachment,
  AttachmentMap,
  ImportResult,
  ImportWarning,
} from "./types.js";

/**
 * Ein Eingang fuer alle drei Formate. Der Worker ruft nur diese beiden Funktionen auf,
 * die Formatverzweigung bleibt hier.
 */

export async function importFile(bytes: Uint8Array, fileName?: string): Promise<ImportResult> {
  const format = detectFormat(bytes, fileName);

  if (format === "aasx") {
    const result = await importAasx(bytes);
    const model = fromAasCore(result.environment);
    return {
      model,
      format,
      sourceVersion: result.upgradeNotes.length > 0 ? "3.0" : "3.1",
      attachments: result.attachments,
      thumbnail: result.thumbnail,
      upgradeNotes: result.upgradeNotes,
      warnings: collectWarnings(model, result.attachments),
    };
  }

  const text = decodeText(bytes);
  const sourceVersion = detectVersion(format, text);

  if (format === "xml") {
    const result = await importXml(text);
    const model = fromAasCore(result.environment);
    return {
      model,
      format,
      sourceVersion,
      attachments: new Map(),
      thumbnail: null,
      upgradeNotes: result.upgradeNotes,
      warnings: collectWarnings(model, new Map()),
    };
  }

  const environment = await importJson(text);
  const model = fromAasCore(environment);
  return {
    model,
    format,
    sourceVersion,
    attachments: new Map(),
    thumbnail: null,
    upgradeNotes: [],
    warnings: collectWarnings(model, new Map()),
  };
}

function collectWarnings(model: EditorModel, attachments: AttachmentMap): ImportWarning[] {
  return [...findMissingAttachments(model, attachments), ...collectCollisionWarnings(model)];
}

export interface ExportRequest {
  readonly model: EditorModel;
  readonly format: AasFormat;
  readonly attachments?: AttachmentMap;
  readonly thumbnail?: Attachment | null;
  readonly pretty?: boolean;
}

export interface ExportResult {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly contentType: string;
}

/** Export ist immer Metamodell 3.1 (Plan Abschnitt 1). */
export async function exportFile(request: ExportRequest): Promise<ExportResult> {
  const environment = toAasCore(request.model);
  const encoder = new TextEncoder();

  switch (request.format) {
    case "json":
      return {
        bytes: encoder.encode(exportJson(environment, request.pretty ?? true)),
        fileName: "environment.json",
        contentType: "application/json",
      };
    case "xml":
      return {
        bytes: encoder.encode(await exportXml(environment)),
        fileName: "environment.xml",
        contentType: "application/xml",
      };
    case "aasx": {
      const options: Parameters<typeof exportAasx>[1] = {};
      if (request.attachments) Object.assign(options, { attachments: request.attachments });
      if (request.thumbnail) Object.assign(options, { thumbnail: request.thumbnail });
      return {
        bytes: await exportAasx(environment, options),
        fileName: "environment.aasx",
        // IDTA-01005-3-2: "MIME-type for the AASX format: application/aas+zip", bei der
        // IANA registriert. Bis zum 10.08.2026 stand hier
        // "application/asset-administration-shell-package", das ist nirgends registriert.
        contentType: "application/aas+zip",
      };
    }
  }
}

export * from "./types.js";
export * from "./detect.js";
export * from "./attachments.js";
export * from "./collisions.js";
export { importAasx, exportAasx } from "./aasx.js";
export { importJson, exportJson } from "./json.js";
export { importXml, exportXml } from "./xml.js";
