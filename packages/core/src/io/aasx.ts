import type * as AasTypes from "@aas-core-works/aas-core3.1-typescript/types";
import type { Part } from "aas-package3-typescript";

import { detectXmlVersion, type UpgradeNote } from "../upgrade/v30ToV31.js";
import { normalizePath } from "./attachments.js";
import { importJson, exportJson } from "./json.js";
import { importXml, exportXml } from "./xml.js";
import { ImportError, type Attachment, type AttachmentMap } from "./types.js";

/**
 * AASX lesen und schreiben.
 *
 * Ein AASX ist ein OPC- und damit ZIP-Container. `aas-package3-typescript` nutzt fflate
 * und braucht kein DOM, deshalb laeuft das vollstaendig im Browser beziehungsweise im
 * Worker (Plan Abschnitt 2 und 4).
 *
 * Die Bibliothek wird dynamisch geladen, sie wird nur bei AASX gebraucht.
 */

const SPEC_URI = "/aasx/aas-spec.xml";
const ORIGIN_CONTENT_TYPE = "text/plain";
const XML_CONTENT_TYPE = "application/xml";
const JSON_CONTENT_TYPE = "application/json";

async function loadPackaging() {
  const mod = await import("aas-package3-typescript");
  return mod;
}

export interface AasxImportResult {
  readonly environment: AasTypes.Environment;
  readonly attachments: AttachmentMap;
  readonly thumbnail: Attachment | null;
  readonly upgradeNotes: readonly UpgradeNote[];
  /** Welches Format der Spec-Part hatte, nur zur Anzeige */
  readonly specContentType: string;
}

export async function importAasx(bytes: Uint8Array): Promise<AasxImportResult> {
  const { NewPackaging } = await loadPackaging();
  const pkg = await NewPackaging().OpenReadFromBytes(bytes);

  try {
    const specsByType = await pkg.SpecsByContentType();
    const spec = pickSpec(specsByType);
    if (!spec) {
      throw new ImportError(
        "Das AASX enthaelt keinen lesbaren Spec-Part. Erwartet wird ein Teil mit XML- oder JSON-Inhalt.",
      );
    }

    const text = spec.part.ReadAllText();
    let environment: AasTypes.Environment;
    let upgradeNotes: readonly UpgradeNote[] = [];

    if (spec.kind === "xml") {
      const result = await importXml(text);
      environment = result.environment;
      upgradeNotes = result.upgradeNotes;
    } else {
      environment = await importJson(text);
    }

    // Supplementary Files: File-Elemente tragen nur diese Pfade, nicht den Inhalt.
    const attachments = new Map<string, Attachment>();
    for (const part of await pkg.SupplementariesFor(spec.part)) {
      attachments.set(normalizePath(part.URI.pathname), {
        path: normalizePath(part.URI.pathname),
        contentType: part.ContentType,
        bytes: part.ReadAllBytes(),
      });
    }

    const thumbnailPart = await pkg.Thumbnail();
    const thumbnail: Attachment | null = thumbnailPart
      ? {
          path: normalizePath(thumbnailPart.URI.pathname),
          contentType: thumbnailPart.ContentType,
          bytes: thumbnailPart.ReadAllBytes(),
        }
      : null;

    return { environment, attachments, thumbnail, upgradeNotes, specContentType: spec.contentType };
  } finally {
    pkg.Close();
  }
}

interface PickedSpec {
  readonly part: Part;
  readonly kind: "xml" | "json";
  readonly contentType: string;
}

function pickSpec(specsByType: Record<string, Part[]>): PickedSpec | null {
  for (const [contentType, parts] of Object.entries(specsByType)) {
    const part = parts[0];
    if (!part) continue;
    const lower = contentType.toLowerCase();
    if (lower.includes("xml")) return { part, kind: "xml", contentType };
    if (lower.includes("json")) return { part, kind: "json", contentType };
  }
  return null;
}

export interface AasxExportOptions {
  readonly attachments?: AttachmentMap;
  readonly thumbnail?: Attachment | null;
  /** Format des Spec-Parts im Paket. XML ist der uebliche Fall. */
  readonly specFormat?: "xml" | "json";
}

export async function exportAasx(
  environment: AasTypes.Environment,
  options: AasxExportOptions = {},
): Promise<Uint8Array> {
  const { NewPackaging } = await loadPackaging();
  const specFormat = options.specFormat ?? "xml";

  // In-Memory-Container: die Bibliothek schreibt ueber einen ReadWriteSeeker.
  let buffer: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  const stream = {
    readAll: () => buffer,
    writeAll: (data: Uint8Array<ArrayBuffer>) => {
      buffer = data;
    },
  };

  const pkg = await NewPackaging().CreateInStream(stream);

  try {
    const specUri = new URL(
      specFormat === "xml" ? SPEC_URI : SPEC_URI.replace(/\.xml$/, ".json"),
      "file://",
    );
    const specText =
      specFormat === "xml" ? await exportXml(environment) : exportJson(environment, true);

    const specPart = await pkg.PutPart(
      specUri,
      specFormat === "xml" ? XML_CONTENT_TYPE : JSON_CONTENT_TYPE,
      new TextEncoder().encode(specText),
    );
    await pkg.MakeSpec(specPart);

    for (const attachment of options.attachments?.values() ?? []) {
      const part = await pkg.PutPart(
        new URL(normalizePath(attachment.path), "file://"),
        attachment.contentType,
        attachment.bytes,
      );
      await pkg.RelateSupplementaryToSpec(part, specPart);
    }

    if (options.thumbnail) {
      const part = await pkg.PutPart(
        new URL(normalizePath(options.thumbnail.path), "file://"),
        options.thumbnail.contentType,
        options.thumbnail.bytes,
      );
      await pkg.SetThumbnail(part);
    }

    // Flush liefert die fertigen Paketbytes. Die Dokumentation nennt writeToBytes,
    // das ist in 1.0.0 aber privat.
    return await pkg.Flush();
  } finally {
    pkg.Close();
  }
}

export { ORIGIN_CONTENT_TYPE, detectXmlVersion };
