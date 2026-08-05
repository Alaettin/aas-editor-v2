import { create } from "zustand";

import { ApiError } from "@/api/client";
import { projectsApi, type ProjectSummary } from "@/api/projects";

/**
 * Die Projektliste. Haelt bewusst keinen Editor-Zustand und importiert nichts aus
 * store/editor.ts: dieser Store liegt im Startbundle, der Editor nicht.
 */

interface ProjectsState {
  projekte: readonly ProjectSummary[];
  cursor: string | null;
  status: "leer" | "laedt" | "bereit" | "fehler";
  fehler: string | null;

  laden: () => Promise<void>;
  mehrLaden: () => Promise<void>;
  anlegen: (name: string, environment: unknown, sourceFormat: string, nodeCount: number) => Promise<string>;
  loeschen: (id: string) => Promise<void>;
}

function meldung(error: unknown): string {
  return error instanceof ApiError ? error.message : "Der Server ist nicht erreichbar.";
}

export const useProjects = create<ProjectsState>()((set, get) => ({
  projekte: [],
  cursor: null,
  status: "leer",
  fehler: null,

  async laden() {
    set({ status: "laedt", fehler: null });
    try {
      const page = await projectsApi.list(null);
      set({ projekte: page.items, cursor: page.nextCursor, status: "bereit" });
    } catch (error) {
      set({ status: "fehler", fehler: meldung(error) });
    }
  },

  async mehrLaden() {
    const { cursor, projekte } = get();
    if (cursor === null) return;
    try {
      const page = await projectsApi.list(cursor);
      set({ projekte: [...projekte, ...page.items], cursor: page.nextCursor });
    } catch (error) {
      set({ fehler: meldung(error) });
    }
  },

  async anlegen(name, environment, sourceFormat, nodeCount) {
    const antwort = await projectsApi.create({ name, environment, sourceFormat, nodeCount });
    set({ projekte: [antwort.project, ...get().projekte] });
    return antwort.project.id;
  },

  async loeschen(id) {
    await projectsApi.remove(id);
    set({ projekte: get().projekte.filter((projekt) => projekt.id !== id) });
  },
}));
