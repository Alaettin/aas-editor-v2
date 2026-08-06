import { api, apiBytes, apiUpload } from "./client";

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly metamodelVersion: string;
  readonly sourceFormat: string;
  readonly revision: number;
  readonly nodeCount: number;
  readonly submodelCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

/** Wonach der Einstieg sortieren darf. Der Server laesst nichts anderes durch. */
export type SortFeld =
  "name" | "nodeCount" | "submodelCount" | "revision" | "updatedAt" | "createdAt";

export interface ProjectQuery {
  readonly limit: number;
  readonly offset: number;
  readonly q: string;
  /** Untergrenze auf `updatedAt`, hier gerechnet: nur der Klient kennt seine Zeitzone. */
  readonly seit: number | null;
  readonly sort: SortFeld;
  readonly dir: "asc" | "desc";
}

export interface ProjectPage {
  readonly items: readonly ProjectSummary[];
  readonly total: number;
}

function suchpfad(query: ProjectQuery): string {
  const params = new URLSearchParams();
  params.set("limit", String(query.limit));
  params.set("offset", String(query.offset));
  params.set("sort", query.sort);
  params.set("dir", query.dir);
  if (query.q !== "") params.set("q", query.q);
  if (query.seit !== null) params.set("seit", String(query.seit));
  return `/api/projects?${params.toString()}`;
}

export interface ProjectDetail {
  readonly projekt: ProjectSummary;
  readonly revision: number;
  readonly environment: Record<string, unknown>;
}

export interface SubmodelUebersicht {
  readonly id: string;
  readonly idShort: string | null;
  readonly elementCount: number;
}

/** Was das Detailpanel des Einstiegs braucht, ohne das Environment. */
export interface ProjectUebersicht {
  readonly projekt: ProjectSummary;
  readonly submodelle: readonly SubmodelUebersicht[];
  /** Constraint-Verstoesse und Datenwarnungen zusammen, gerechnet im Server. */
  readonly befunde: number;
}

export interface FileInfo {
  readonly id: string;
  readonly path: string;
  readonly contentType: string;
  readonly size: number;
  readonly sha256: string;
  readonly role: string;
  readonly referenced: boolean;
}

export interface VersionSummary {
  readonly id: string;
  readonly revision: number;
  readonly label: string | null;
  readonly reason: string;
  readonly snapshotBytes: number;
  readonly nodeCount: number;
  readonly createdAt: number;
}

export interface SaveBody {
  readonly revision: number;
  readonly environment: unknown;
  readonly name?: string;
  readonly sourceFormat?: string;
  readonly nodeCount?: number;
}

export const projectsApi = {
  list: (query: ProjectQuery) => api<ProjectPage>(suchpfad(query)),

  /**
   * Ist der Name schon vergeben? Geht ueber dieselbe Liste, damit es keine zweite Route
   * gibt, die dasselbe weiss. Der Server bleibt trotzdem die Wahrheit: zwischen dieser
   * Frage und dem Absenden kann ein anderer Tab den Namen belegen.
   */
  nameVergeben: async (name: string, ausserId?: string) => {
    const seite = await api<ProjectPage>(
      suchpfad({ limit: 5, offset: 0, q: name, seit: null, sort: "name", dir: "asc" }),
    );
    // Die Suche trifft Teilzeichenfolgen, gemeint ist der genaue Name.
    return seite.items.some((projekt) => projekt.name === name && projekt.id !== ausserId);
  },

  create: (body: {
    name: string;
    environment: unknown;
    sourceFormat?: string;
    nodeCount?: number;
  }) =>
    api<{ project: ProjectSummary; environment: Record<string, unknown> }>("/api/projects", {
      method: "POST",
      body,
    }),

  get: (id: string) => api<ProjectDetail>(`/api/projects/${id}`),

  uebersicht: (id: string) => api<ProjectUebersicht>(`/api/projects/${id}/uebersicht`),

  save: (id: string, body: SaveBody) =>
    api<{ projekt: ProjectSummary }>(`/api/projects/${id}`, { method: "PUT", body }),

  remove: (id: string) => api<void>(`/api/projects/${id}`, { method: "DELETE" }),
};

export const filesApi = {
  list: (projektId: string) => api<{ items: FileInfo[] }>(`/api/projects/${projektId}/files`),

  upload: (projektId: string, path: string, contentType: string, bytes: Uint8Array) => {
    const form = new FormData();
    form.append("path", path);
    const blob = new Blob([bytes as BlobPart], { type: contentType });
    // Der Dateiname ist nur Beiwerk, massgeblich ist der Paketpfad im Feld "path".
    form.append("datei", blob, path.split("/").pop() ?? "anhang");
    return apiUpload<{ datei: FileInfo }>(`/api/projects/${projektId}/files`, form);
  },

  download: (projektId: string, fileId: string) =>
    apiBytes(`/api/projects/${projektId}/files/${fileId}`),
};

export const versionsApi = {
  create: (projektId: string, label: string | null) =>
    api<{ version: VersionSummary }>(`/api/projects/${projektId}/versions`, {
      method: "POST",
      body: { label },
    }),

  list: (projektId: string) =>
    api<Page<VersionSummary>>(`/api/projects/${projektId}/versions?limit=50`),

  get: (projektId: string, versionId: string) =>
    api<{ version: VersionSummary; environment: Record<string, unknown> }>(
      `/api/projects/${projektId}/versions/${versionId}`,
    ),
};
