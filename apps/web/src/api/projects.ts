import { api, apiBytes, apiUpload } from "./client";

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly metamodelVersion: string;
  readonly sourceFormat: string;
  readonly revision: number;
  readonly nodeCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export interface ProjectDetail {
  readonly projekt: ProjectSummary;
  readonly revision: number;
  readonly environment: Record<string, unknown>;
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
  list: (cursor: string | null) =>
    api<Page<ProjectSummary>>(`/api/projects?limit=25${cursor === null ? "" : `&cursor=${cursor}`}`),

  create: (body: { name: string; environment: unknown; sourceFormat?: string; nodeCount?: number }) =>
    api<{ project: ProjectSummary; environment: Record<string, unknown> }>("/api/projects", {
      method: "POST",
      body,
    }),

  get: (id: string) => api<ProjectDetail>(`/api/projects/${id}`),

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
