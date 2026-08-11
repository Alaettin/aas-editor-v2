import { encodeIdentifier } from "@aas-editor/core";

import { api } from "./client";

/**
 * Das Submodel Repository.
 *
 * Nur der angemeldete Teil steht hier. Die beiden Lesezugriffe nach IDTA-01002 unter
 * `/api/repo/<uuid>/...` ruft die Oberflaeche nie auf: sie sind fuer fremde Werkzeuge da,
 * und was hier gebraucht wird, steht ohnehin schon in der Liste.
 */

export interface RepositoryInfo {
  readonly id: string;
  readonly anzahl: number;
  readonly erstelltAm: number;
  /** Vom Server aus der Anfrage abgeleitet, nicht im Browser zusammengesetzt. */
  readonly basisAdresse: string;
}

export interface RepositoryEintrag {
  readonly id: string;
  readonly idShort: string | null;
  readonly herkunftProjektId: string;
  readonly herkunftProjektName: string;
  readonly uebernommenAm: number;
  readonly updatedAt: number;
}

export interface Uebernahme {
  readonly id: string;
  readonly idShort: string | null;
  readonly ueberschrieben: boolean;
}

export const repositoryApi = {
  /** Null, solange keines gestartet ist. */
  info: () => api<RepositoryInfo | null>("/api/repository"),

  starten: () => api<RepositoryInfo>("/api/repository", { method: "POST" }),

  liste: () => api<{ items: RepositoryEintrag[] }>("/api/repository/submodels"),

  /**
   * Ein Teilmodell uebernehmen.
   *
   * Ohne `ueberschreiben` antwortet der Server mit 409 und dem Code
   * `submodel-schon-im-repo`, sobald die id bereits im Repository steht. Das ist der
   * gewollte Weg und kein Ausnahmefall: der Aufrufer faengt ihn und fragt zurueck.
   */
  uebernehmen: (projektId: string, submodelId: string, ueberschreiben = false) =>
    api<Uebernahme>("/api/repository/submodels", {
      method: "POST",
      body: { projektId, submodelId, ...(ueberschreiben ? { ueberschreiben: true } : {}) },
    }),

  entfernen: (submodelId: string) =>
    api<void>(`/api/repository/submodels/${encodeIdentifier(submodelId)}`, { method: "DELETE" }),
};
