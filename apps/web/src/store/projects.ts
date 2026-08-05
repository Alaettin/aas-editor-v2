import { create } from "zustand";

import { ApiError } from "@/api/client";
import { projectsApi, type ProjectSummary } from "@/api/projects";
import i18n from "@/i18n";
import { meldeErfolg, meldeFehler } from "@/lib/melden";

/**
 * Die Projektliste. Haelt bewusst keinen Editor-Zustand und importiert nichts aus
 * store/editor.ts: dieser Store liegt im Startbundle, der Editor nicht.
 */

interface ProjectsState {
  projekte: readonly ProjectSummary[];
  cursor: string | null;
  status: "leer" | "laedt" | "bereit" | "fehler";
  fehler: string | null;

  /** Ob gerade nachgeladen wird. Der Knopf am Fuss der Liste sagt es. */
  laedtMehr: boolean;
  /** Welches Projekt gerade geloescht wird, fuer den Zustand der Rueckfrage. */
  loeschtId: string | null;

  laden: () => Promise<void>;
  mehrLaden: () => Promise<void>;
  anlegen: (
    name: string,
    environment: unknown,
    sourceFormat: string,
    nodeCount: number,
  ) => Promise<string>;
  /** Liefert, ob es geklappt hat. Die Rueckfrage bleibt sonst mit ihrem Fehler stehen. */
  loeschen: (id: string) => Promise<boolean>;
}

function meldung(error: unknown): string {
  return error instanceof ApiError ? error.text : i18n.t("fehler.serverNichtErreichbar");
}

export const useProjects = create<ProjectsState>()((set, get) => ({
  projekte: [],
  cursor: null,
  status: "leer",
  fehler: null,
  laedtMehr: false,
  loeschtId: null,

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
    const { cursor, projekte, laedtMehr } = get();
    if (cursor === null || laedtMehr) return;
    set({ laedtMehr: true, fehler: null });
    try {
      const page = await projectsApi.list(cursor);
      set({ projekte: [...projekte, ...page.items], cursor: page.nextCursor });
    } catch (error) {
      set({ fehler: meldung(error) });
    } finally {
      set({ laedtMehr: false });
    }
  },

  async anlegen(name, environment, sourceFormat, nodeCount) {
    const antwort = await projectsApi.create({ name, environment, sourceFormat, nodeCount });
    set({ projekte: [antwort.project, ...get().projekte] });
    return antwort.project.id;
  },

  async loeschen(id) {
    // Frueher ohne jedes `catch`: ein Fehlschlag endete als unbehandelte Zusage, die
    // Zeile blieb stehen, und niemand erfuhr warum.
    set({ loeschtId: id, fehler: null });
    try {
      await projectsApi.remove(id);
      set({ projekte: get().projekte.filter((projekt) => projekt.id !== id) });
      meldeErfolg("melden.projektGeloescht");
      return true;
    } catch (error) {
      meldeFehler(error, "fehler.loeschen");
      set({ fehler: meldung(error) });
      return false;
    } finally {
      set({ loeschtId: null });
    }
  },
}));
