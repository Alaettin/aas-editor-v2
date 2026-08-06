import { create } from "zustand";

import { ApiError } from "@/api/client";
import {
  projectsApi,
  type ProjectQuery,
  type ProjectSummary,
  type ProjectUebersicht,
  type SortFeld,
} from "@/api/projects";
import i18n from "@/i18n";
import { meldeErfolg, meldeFehler } from "@/lib/melden";

/**
 * Die Projektliste. Haelt bewusst keinen Editor-Zustand und importiert nichts aus
 * store/editor.ts: dieser Store liegt im Startbundle, der Editor nicht.
 *
 * Gefiltert, sortiert und geblaettert wird im Server. Ein Filter, der nur die geladene
 * Seite trifft, behauptet Zahlen, die nicht stimmen.
 *
 * Kein Zustand, der geladene Daten spiegelt: Seitenzahl, Bereich und die Zaehler der
 * Filterleiste werden aus `total` und `facetten` abgeleitet, nicht mitgefuehrt.
 */

/** Zeitfenster der Filterleiste. Die Grenze rechnet der Klient, nur er kennt seine Zone. */
export type Zeitfenster = "alle" | "heute" | "woche" | "monat";

/** Feste Seitengroesse. Ein Umschalter dafuer war eine Einstellung ohne Entscheidung. */
export const PRO_SEITE = 50;

export interface Filter {
  readonly suche: string;
  readonly zeitfenster: Zeitfenster;
}

export const LEERER_FILTER: Filter = { suche: "", zeitfenster: "alle" };

/**
 * Anfang des Zeitfensters in Ortszeit. `new Date(...)` mit Jahr, Monat und Tag trifft die
 * lokale Mitternacht, `setDate` mit einem negativen Wert rutscht korrekt ueber Monats- und
 * Jahresgrenzen.
 */
export function grenzeVon(fenster: Zeitfenster, jetzt = new Date()): number | null {
  const mitternacht = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate());
  switch (fenster) {
    case "alle":
      return null;
    case "heute":
      return mitternacht.getTime();
    case "woche": {
      // Montag als Wochenanfang, wie im deutschen Kalender.
      const versatz = (mitternacht.getDay() + 6) % 7;
      const montag = new Date(mitternacht);
      montag.setDate(montag.getDate() - versatz);
      return montag.getTime();
    }
    case "monat":
      return new Date(jetzt.getFullYear(), jetzt.getMonth(), 1).getTime();
  }
}

interface ProjectsState {
  readonly projekte: readonly ProjectSummary[];
  readonly total: number;
  readonly status: "leer" | "laedt" | "bereit" | "fehler";
  readonly fehler: string | null;

  readonly filter: Filter;
  readonly sort: SortFeld;
  readonly dir: "asc" | "desc";
  readonly seite: number;

  /** Welche Zeile rechts im Detail steht. Null heisst: nichts ausgewaehlt. */
  readonly auswahlId: string | null;
  readonly detail: ProjectUebersicht | null;
  readonly detailLaedt: boolean;

  /** Welches Projekt gerade geloescht wird, fuer den Zustand der Rueckfrage. */
  readonly loeschtId: string | null;

  laden: () => Promise<void>;
  setzeSuche: (suche: string) => void;
  setzeZeitfenster: (fenster: Zeitfenster) => void;
  sortiereNach: (feld: SortFeld) => void;
  geheZuSeite: (seite: number) => void;
  waehle: (id: string | null) => Promise<void>;

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

function alsQuery(state: ProjectsState): ProjectQuery {
  return {
    limit: PRO_SEITE,
    offset: (state.seite - 1) * PRO_SEITE,
    q: state.filter.suche,
    seit: grenzeVon(state.filter.zeitfenster),
    sort: state.sort,
    dir: state.dir,
  };
}

export const useProjects = create<ProjectsState>()((set, get) => {
  /** Jede Aenderung an Filter oder Sortierung fuehrt zurueck auf Seite eins und laedt neu. */
  const neuLaden = (teil: Partial<ProjectsState>, aufSeiteEins = true) => {
    set({ ...teil, ...(aufSeiteEins ? { seite: 1 } : {}) });
    void get().laden();
  };

  return {
    projekte: [],
    total: 0,
    status: "leer",
    fehler: null,

    filter: LEERER_FILTER,
    sort: "updatedAt",
    dir: "desc",
    seite: 1,

    auswahlId: null,
    detail: null,
    detailLaedt: false,
    loeschtId: null,

    async laden() {
      set({ status: "laedt", fehler: null });
      try {
        const seite = await projectsApi.list(alsQuery(get()));
        set({ projekte: seite.items, total: seite.total, status: "bereit" });
      } catch (error) {
        set({ status: "fehler", fehler: meldung(error) });
      }
    },

    setzeSuche(suche) {
      neuLaden({ filter: { ...get().filter, suche } });
    },

    setzeZeitfenster(zeitfenster) {
      neuLaden({ filter: { ...get().filter, zeitfenster } });
    },

    sortiereNach(feld) {
      const { sort, dir } = get();
      // Dasselbe Feld noch einmal kehrt die Richtung um, ein neues Feld beginnt absteigend:
      // bei Zahlen und Daten ist das Grosse und Junge das Gesuchte.
      neuLaden(
        sort === feld ? { dir: dir === "asc" ? "desc" : "asc" } : { sort: feld, dir: "desc" },
      );
    },

    geheZuSeite(seite) {
      neuLaden({ seite }, false);
    },

    async waehle(id) {
      if (id === null) {
        set({ auswahlId: null, detail: null, detailLaedt: false });
        return;
      }
      set({ auswahlId: id, detail: null, detailLaedt: true });
      try {
        const detail = await projectsApi.uebersicht(id);
        // Zwischenzeitlich kann eine andere Zeile gewaehlt worden sein. Ohne diese Wache
        // ueberschriebe die langsamere Antwort die schnellere.
        if (get().auswahlId !== id) return;
        set({ detail, detailLaedt: false });
      } catch (error) {
        if (get().auswahlId !== id) return;
        set({ detailLaedt: false });
        meldeFehler(error);
      }
    },

    async anlegen(name, environment, sourceFormat, nodeCount) {
      const antwort = await projectsApi.create({ name, environment, sourceFormat, nodeCount });
      void get().laden();
      return antwort.project.id;
    },

    async loeschen(id) {
      // Frueher ohne jedes `catch`: ein Fehlschlag endete als unbehandelte Zusage, die
      // Zeile blieb stehen, und niemand erfuhr warum.
      set({ loeschtId: id, fehler: null });
      try {
        await projectsApi.remove(id);
        meldeErfolg("melden.projektGeloescht");
        if (get().auswahlId === id) set({ auswahlId: null, detail: null });
        // Die Seite kann durch das Loeschen leer geworden sein, dann eine zurueck.
        const { seite, total } = get();
        const letzteSeite = Math.max(1, Math.ceil((total - 1) / PRO_SEITE));
        set({ seite: Math.min(seite, letzteSeite) });
        await get().laden();
        return true;
      } catch (error) {
        meldeFehler(error, "fehler.loeschen");
        set({ fehler: meldung(error) });
        return false;
      } finally {
        set({ loeschtId: null });
      }
    },
  };
});
