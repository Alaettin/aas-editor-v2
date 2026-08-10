import * as Comlink from "comlink";
import { applyPatches, countNodes, type EditorModel, type Patch } from "@aas-editor/core";
import {
  exportFile,
  importFile,
  type AasFormat,
  type Attachment,
} from "@aas-editor/core/io";
import { validate } from "@aas-editor/core/validation";

import type { AasWorkerApi, ExportedFile, OpenResult } from "./protocol.js";

/**
 * Der AAS-Kern laeuft vollstaendig hier. Moeglich, weil weder die SDKs noch
 * aas-package3 ein DOM brauchen (Plan Abschnitt 2), noetig, weil Parsen und Validieren
 * grosser Modelle den Hauptthread sonst blockieren.
 *
 * `verification` und `xmlization` sind nur ueber dieses Modul erreichbar und landen
 * dadurch nie im Startbundle.
 *
 * Abweichung vom Plan, bewusst: der Worker haelt als Spiegel das normalisierte Modell
 * und nicht zusaetzlich die aas-core-Environment. Die Environment wird fuer verify() und
 * fuer den Export aus dem Modell erzeugt. Zwei parallele Wahrheiten koennen so nicht
 * auseinanderlaufen, und der Patch-Kanal bleibt unveraendert.
 */

let model: EditorModel | null = null;
// Veraenderbar, seit die Serverablage einzelne Anhaenge nachreicht. Nach aussen bleibt es
// eine AttachmentMap, also eine ReadonlyMap.
let attachments: Map<string, Attachment> = new Map();
let thumbnail: Attachment | null = null;

function requireModel(): EditorModel {
  if (!model) throw new Error("Es ist keine Umgebung geoeffnet.");
  return model;
}

const api: AasWorkerApi = {
  async open(bytes, fileName) {
    const result = await importFile(bytes, fileName);
    model = result.model;
    attachments = new Map(result.attachments);
    thumbnail = result.thumbnail;

    const openResult: OpenResult = {
      model: result.model,
      format: result.format,
      sourceVersion: result.sourceVersion,
      attachments: [...result.attachments.values()].map((a) => ({
        path: a.path,
        contentType: a.contentType,
        size: a.bytes.length,
      })),
      hasThumbnail: result.thumbnail !== null,
      upgradeNotes: result.upgradeNotes,
      warnings: result.warnings,
    };
    return openResult;
  },

  async setModel(next: EditorModel) {
    model = next;
    // Ein wiederhergestellter Entwurf bringt keine Anhangs-Bytes mit, siehe autosave.ts.
    attachments = new Map();
    thumbnail = null;
  },

  async applyPatches(patches: readonly Patch[]) {
    model = applyPatches(requireModel(), patches as Patch[]);
  },

  async validate() {
    return validate(requireModel(), attachments);
  },

  async exportAs(format: AasFormat) {
    const result = await exportFile({ model: requireModel(), format, attachments, thumbnail });
    const exported: ExportedFile = result;
    return Comlink.transfer(exported, [result.bytes.buffer as ArrayBuffer]);
  },

  async listAttachments() {
    return [...attachments.values()].map((a) => ({
      path: a.path,
      contentType: a.contentType,
      size: a.bytes.length,
    }));
  },

  async getAttachment(path: string) {
    const found = attachments.get(path);
    if (!found) return null;
    // Eine Kopie, nicht das Original: der uebertragene Puffer wird auf dieser Seite
    // sonst geleert und der Anhang waere beim naechsten Export weg.
    const bytes = found.bytes.slice();
    return Comlink.transfer(
      { path: found.path, contentType: found.contentType, bytes },
      [bytes.buffer as ArrayBuffer],
    );
  },

  async getThumbnail() {
    if (!thumbnail) return null;
    // Dieselbe Kopierdisziplin wie bei `getAttachment`, aus demselben Grund: der
    // uebertragene Puffer waere hier sonst geleert und das Thumbnail beim naechsten
    // Export weg.
    const bytes = thumbnail.bytes.slice();
    return Comlink.transfer(
      { path: thumbnail.path, contentType: thumbnail.contentType, bytes },
      [bytes.buffer as ArrayBuffer],
    );
  },

  async putAttachment(path: string, contentType: string, bytes: Uint8Array) {
    attachments.set(path, { path, contentType, bytes });
  },

  async removeAttachment(path: string) {
    attachments.delete(path);
  },

  async nodeCount() {
    return countNodes(requireModel());
  },
};

Comlink.expose(api);
