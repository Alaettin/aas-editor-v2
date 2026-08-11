import { create } from "zustand";

import { ApiError } from "@/api/client";
import { repositoryApi, type RepositoryEintrag, type RepositoryInfo } from "@/api/repository";
import i18n from "@/i18n";
import { meldeErfolg, meldeFehler } from "@/lib/melden";

/**
 * Das Submodel Repository des angemeldeten Nutzers.
 *
 * Wie `store/projects.ts` ohne jeden Editor-Zustand: der Bildschirm liegt im
 * Nachladebuendel neben der Projektliste, der Editor bleibt draussen.
 *
 * Kein Zustand, der geladene Daten spiegelt: die Zahl der Teilmodelle wird aus `eintraege`
 * abgeleitet und nicht aus `info.anzahl` gelesen, obwohl der Server sie mitschickt. Zwei
 * Zahlen ueber dieselbe Sache laufen auseinander, sobald eine Uebernahme die eine
 * fortschreibt und die andere nicht. Dasselbe gilt fuer den gewaehlten Eintrag, siehe
 * `eintragVon` am Ende der Datei.
 */

interface RepositoryState {
  readonly info: RepositoryInfo | null;
  readonly eintraege: readonly RepositoryEintrag[];
  readonly status: "leer" | "laedt" | "bereit" | "fehler";
  readonly fehler: string | null;
  /** Welche id gerade im Detail steht. */
  readonly auswahlId: string | null;
  readonly startet: boolean;

  laden: () => Promise<void>;
  starten: () => Promise<void>;
  waehle: (id: string | null) => void;
  entfernen: (id: string) => Promise<boolean>;
}

function meldung(error: unknown): string {
  return error instanceof ApiError ? error.text : i18n.t("fehler.serverNichtErreichbar");
}

export const useRepository = create<RepositoryState>()((set, get) => ({
  info: null,
  eintraege: [],
  status: "leer",
  fehler: null,
  auswahlId: null,
  startet: false,

  async laden() {
    set({ status: "laedt", fehler: null });
    try {
      const info = await repositoryApi.info();
      if (info === null) {
        set({ info: null, eintraege: [], status: "bereit" });
        return;
      }
      const liste = await repositoryApi.liste();
      set({ info, eintraege: liste.items, status: "bereit" });
    } catch (error) {
      set({ status: "fehler", fehler: meldung(error) });
    }
  },

  async starten() {
    set({ startet: true });
    try {
      const info = await repositoryApi.starten();
      set({ info, eintraege: [], status: "bereit", fehler: null });
      meldeErfolg("repository.gestartet");
    } catch (error) {
      meldeFehler(error, "repository.startenFehlgeschlagen");
      set({ fehler: meldung(error) });
    } finally {
      set({ startet: false });
    }
  },

  waehle(id) {
    set({ auswahlId: id });
  },

  async entfernen(id) {
    try {
      await repositoryApi.entfernen(id);
      // Die Auswahl zeigte auf die Zeile, die es nicht mehr gibt.
      if (get().auswahlId === id) set({ auswahlId: null });
      await get().laden();
      meldeErfolg("repository.entfernt");
      return true;
    } catch (error) {
      meldeFehler(error, "repository.entfernenFehlgeschlagen");
      return false;
    }
  },
}));

/** Der gewaehlte Eintrag, abgeleitet statt mitgefuehrt. */
export function eintragVon(
  eintraege: readonly RepositoryEintrag[],
  auswahlId: string | null,
): RepositoryEintrag | null {
  return eintraege.find((eintrag) => eintrag.id === auswahlId) ?? null;
}
