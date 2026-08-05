import * as Comlink from "comlink";
import {
  applyPatches,
  countNodes,
  NODE_HEIGHT,
  NODE_WIDTH,
  type EditorModel,
  type Graph,
  type LayoutResult,
  type Patch,
} from "@aas-editor/core";
import {
  exportFile,
  importFile,
  type AasFormat,
  type Attachment,
} from "@aas-editor/core/io";
import { validate } from "@aas-editor/core/validation";

import type { AasWorkerApi, ExportedFile, OpenResult } from "./protocol.js";

/**
 * Die Adresse des elkjs-Rechenkerns als eigenstaendige Datei.
 *
 * `?url` laesst Vite die Datei als Asset ablegen und gibt nur ihre Adresse zurueck. Der
 * 456-KB-Brocken wird damit **erst geladen, wenn das erste Layout laeuft**, und liegt
 * weder im Startbundle noch im Worker-Chunk.
 */
const ELK_KERN_URL = new URL("elkjs/lib/elk-worker.min.js", import.meta.url).href;

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

  async layoutGraph(graph: Graph): Promise<LayoutResult> {
    // elkjs ist mit 456 KB gzip der groesste Brocken im Projekt.
    //
    // Stolperfalle: `elk.bundled.js` sucht seinen Rechenkern intern ueber `require` und
    // scheitert unter Vite mit "_Worker is not a constructor", auch mit Vorbuendelung.
    // Der von elkjs fuer den Browser vorgesehene Weg ist die schlanke `elk-api` (2,9 KB)
    // plus die Adresse des Rechenkerns. ELK startet ihn dann selbst als eigenen Worker.
    // Wir sind zwar schon im Worker, aber verschachtelte Worker sind zulaessig, und der
    // Hauptthread bleibt so erst recht frei.
    const { default: ELK } = await import("elkjs/lib/elk-api.js");
    const elk = new ELK({ workerUrl: ELK_KERN_URL });

    const begonnen = performance.now();
    const ergebnis = await elk.layout({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.layered.spacing.nodeNodeBetweenLayers": "80",
        "elk.spacing.nodeNode": "28",
        "elk.layered.crossingMinimization.semiInteractive": "true",
      },
      children: graph.nodes.map((node) => ({
        id: node.id,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      })),
      edges: graph.edges.map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
    });
    const dauer = performance.now() - begonnen;

    const positionen = new Map(
      (ergebnis.children ?? []).map((kind) => [kind.id, { x: kind.x ?? 0, y: kind.y ?? 0 }]),
    );

    const nodes = graph.nodes.map((node) => ({
      ...node,
      x: positionen.get(node.id)?.x ?? 0,
      y: positionen.get(node.id)?.y ?? 0,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    }));

    // Die Ausdehnung aus den Knoten ableiten statt aus der Wurzel: ELK gibt sie nicht
    // zuverlaessig zurueck, und so stimmt sie in jedem Fall.
    return {
      nodes,
      width: nodes.reduce((max, node) => Math.max(max, node.x + node.width), 0),
      height: nodes.reduce((max, node) => Math.max(max, node.y + node.height), 0),
      durationMs: dauer,
    };
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
