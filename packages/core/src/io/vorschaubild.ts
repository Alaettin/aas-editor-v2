import type * as AasTypes from "@aas-core-works/aas-core3.1-typescript/types";

import { normalizePath } from "./attachments.js";
import type { Attachment, AttachmentMap } from "./types.js";

/**
 * Das Vorschaubild des AASX-Containers.
 *
 * Ein AASX fuehrt es als eigenen OPC-Teil in der Wurzel, **neben** den Supplementary
 * Files. Das Modell kennt es nicht: dort steht `assetInformation.defaultThumbnail`, und das
 * zeigt auf einen Anhang. Zwei Orte fuer dasselbe Bild, und bis zum 10.08.2026 liefen sie
 * auseinander: wer den Anhang ersetzte, bekam im Export weiter das alte Vorschaubild.
 *
 * Statt den OPC-Teil bei jeder Aenderung nachzufuehren, wird er beim Export **abgeleitet**.
 * Eine Regel an einer Stelle, die auch dann greift, wenn jemand den Pfad von Hand aendert,
 * und die nebenbei den Weg ueber die Serverablage rettet: von dort kommt kein OPC-Teil
 * zurueck, wohl aber der Anhang, auf den `defaultThumbnail` zeigt.
 */

/**
 * @param vorhanden Das beim Oeffnen mitgebrachte Vorschaubild, falls es eines gab.
 * @returns Was als Vorschaubild ins Paket soll, oder `null` fuer keines.
 */
export function vorschaubildFuer(
  environment: AasTypes.Environment,
  attachments: AttachmentMap,
  vorhanden: Attachment | null,
): Attachment | null {
  const quelle = ausDefaultThumbnail(environment, attachments);
  // Kein `defaultThumbnail`, das im Paket liegt: es bleibt beim Mitgebrachten. Ein Paket
  // darf ein Vorschaubild fuehren, ohne dass das Modell davon weiss.
  if (!quelle) return vorhanden;

  return {
    path: wurzelPfad(quelle.path, vorhanden, attachments),
    contentType: quelle.contentType,
    bytes: quelle.bytes,
  };
}

function ausDefaultThumbnail(
  environment: AasTypes.Environment,
  attachments: AttachmentMap,
): Attachment | null {
  for (const shell of environment.assetAdministrationShells ?? []) {
    const pfad = shell.assetInformation.defaultThumbnail?.path;
    if (typeof pfad !== "string" || pfad === "") continue;
    const treffer = attachments.get(normalizePath(pfad));
    if (treffer) return treffer;
  }
  return null;
}

/** Die Endung eines Pfades, klein geschrieben, leer wenn er keine hat. */
function endungVon(pfad: string): string {
  const name = pfad.split("/").pop() ?? "";
  const punkt = name.lastIndexOf(".");
  return punkt > 0 ? name.slice(punkt).toLowerCase() : "";
}

/**
 * Der Ort des Vorschaubilds in der Paketwurzel.
 *
 * Gibt es dort schon eines, bleibt es an seinem Platz. Der Name ist Sache dessen, der das
 * Paket gebaut hat, und die MCP-Werkzeuge legen es bewusst unter `/thumbnail.<endung>` ab.
 * **Ausser** die Endung passt nicht mehr: `[Content_Types].xml` bildet Endungen auf Typen
 * ab, und ein JPEG unter `.png` erklaerte damit alle PNG-Teile des Pakets zu JPEGs.
 *
 * Sonst aus dem Dateinamen gebildet: `/aasx/suppl/image.png` wird zu `/image.png`. Das
 * trifft in beiden geprueften Herstellerdateien genau den Pfad, den sie ohnehin tragen.
 *
 * Liegt dort bereits ein Anhang, wird ausgewichen: derselbe URI zweimal in ein OPC-Paket zu
 * legen ist kein gueltiges Paket mehr.
 */
function wurzelPfad(
  quellPfad: string,
  vorhanden: Attachment | null,
  attachments: AttachmentMap,
): string {
  if (
    vorhanden &&
    endungVon(vorhanden.path) === endungVon(quellPfad) &&
    !attachments.has(vorhanden.path)
  ) {
    return vorhanden.path;
  }

  const name = quellPfad.split("/").pop() ?? "thumbnail";
  const kandidat = `/${name}`;
  if (!attachments.has(kandidat)) return kandidat;

  const punkt = name.lastIndexOf(".");
  const stamm = punkt > 0 ? name.slice(0, punkt) : name;
  const endung = punkt > 0 ? name.slice(punkt) : "";
  for (let n = 2; n < 1000; n += 1) {
    const naechster = `/${stamm}-${n}${endung}`;
    if (!attachments.has(naechster)) return naechster;
  }
  // Unerreichbar, solange niemand 999 gleichnamige Anhaenge in der Wurzel fuehrt.
  return `/thumbnail${endung}`;
}
