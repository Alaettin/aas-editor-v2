import { filesApi, projectsApi } from "@/api/projects";
import { alsDateiname } from "@/lib/dateiname";

/**
 * Ein Projekt aus dem Einstieg heraus exportieren, ohne den Editor zu laden.
 *
 * Der Kern kommt ueber einen dynamischen Import herein. Er bleibt damit ein eigener Chunk,
 * der erst beim Klick geholt wird, und das Startbundle des Einstiegs waechst nicht.
 * Aus demselben Grund kommt hier nichts aus `store/editor`.
 *
 * Der Umweg ueber `EditorModel` entfaellt: das Environment liegt bereits als AAS-JSON vor,
 * und die drei Exportfunktionen des Kerns nehmen eine aas-core-Umgebung direkt.
 */

/**
 * Die drei Wahlmoeglichkeiten des Dialogs.
 *
 * "aasx-json" ist ein AASX, dessen Spec-Part JSON ist. Der Editor-Export schreibt XML in
 * das Paket; beides ist nach IDTA gueltig, JSON ist das, was Werkzeuge heute leichter
 * lesen.
 */
export type Exportziel = "aasx-json" | "json" | "xml";

export const EXPORTZIELE: readonly Exportziel[] = ["aasx-json", "json", "xml"];

/** Welche Endung ein Ziel bekommt. */
export function endungVon(ziel: Exportziel): "json" | "xml" | "aasx" {
  return ziel === "aasx-json" ? "aasx" : ziel;
}

interface Ergebnis {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly dateiname: string;
}

export async function exportiereProjekt(
  projektId: string,
  projektName: string,
  ziel: Exportziel,
): Promise<Ergebnis> {
  const io = await import("@aas-editor/core/io");
  const detail = await projectsApi.get(projektId);
  const environment = await io.importJson(JSON.stringify(detail.environment));
  const dateiname = alsDateiname(projektName, endungVon(ziel));

  if (ziel === "json") {
    return {
      bytes: new TextEncoder().encode(io.exportJson(environment, true)),
      contentType: "application/json",
      dateiname,
    };
  }

  if (ziel === "xml") {
    return {
      bytes: new TextEncoder().encode(await io.exportXml(environment)),
      contentType: "application/xml",
      dateiname,
    };
  }

  return {
    bytes: await io.exportAasx(environment, {
      specFormat: "json",
      attachments: await ladeAnhaenge(projektId),
    }),
    // Der bei der IANA registrierte Typ aus IDTA-01005-3-2, siehe `core/io/index.ts`.
    contentType: "application/aas+zip",
    dateiname,
  };
}

/**
 * Die Anhaenge eines Projekts als Paketpfad auf Bytes.
 *
 * Ohne diesen Schritt verloere ein AASX aus der Liste still seine Anhaenge, waehrend
 * dasselbe Projekt aus dem Editor heraus vollstaendig herauskaeme. Nur referenzierte
 * Dateien kommen mit: unreferenzierte gehoeren zu einer aelteren Fassung.
 */
async function ladeAnhaenge(projektId: string) {
  const { items } = await filesApi.list(projektId);
  const karte = new Map<string, { path: string; contentType: string; bytes: Uint8Array }>();
  for (const info of items) {
    if (!info.referenced) continue;
    const { bytes } = await filesApi.download(projektId, info.id);
    const pfad = info.path.startsWith("/") ? info.path : `/${info.path}`;
    karte.set(pfad, { path: pfad, contentType: info.contentType, bytes });
  }
  return karte;
}

/** Speichert die Bytes ueber einen Anker, so wie der Editor-Export auch. */
export function biete(ergebnis: Ergebnis): void {
  const blob = new Blob([ergebnis.bytes as BlobPart], { type: ergebnis.contentType });
  const url = URL.createObjectURL(blob);
  const anker = document.createElement("a");
  anker.href = url;
  anker.download = ergebnis.dateiname;
  anker.click();
  URL.revokeObjectURL(url);
}
