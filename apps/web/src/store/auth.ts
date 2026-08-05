import { create } from "zustand";

import { authApi, type Benutzer } from "@/api/auth";
import { ApiError } from "@/api/client";
import i18n from "@/i18n";

/**
 * Anmeldezustand. Bewusst getrennt vom Editor-Store: die Anmeldung und die Projektliste
 * duerfen den Editor nicht ins Startbundle ziehen, sonst ist der Gewinn des
 * nachgeladenen Editors wieder weg (Plan Abschnitt 10).
 */

export type AuthStatus = "unbekannt" | "prueft" | "angemeldet" | "abgemeldet";

interface AuthState {
  status: AuthStatus;
  benutzer: Benutzer | null;
  fehler: string | null;

  pruefe: () => Promise<void>;
  anmelden: (benutzer: string, passwort: string) => Promise<boolean>;
  abmelden: () => Promise<void>;
  /** Von aussen gesetzt, wenn eine Anfrage mit 401 antwortet. */
  sitzungVerloren: () => void;
}

export const useAuth = create<AuthState>()((set) => ({
  status: "unbekannt",
  benutzer: null,
  fehler: null,

  async pruefe() {
    set({ status: "prueft" });
    try {
      const { benutzer } = await authApi.me();
      set({ status: "angemeldet", benutzer, fehler: null });
    } catch {
      set({ status: "abgemeldet", benutzer: null });
    }
  },

  async anmelden(benutzer, passwort) {
    set({ fehler: null });
    try {
      const antwort = await authApi.login(benutzer, passwort);
      set({ status: "angemeldet", benutzer: antwort.benutzer, fehler: null });
      return true;
    } catch (error) {
      const fehler =
        error instanceof ApiError && error.status === 429
          ? i18n.t("fehler.zuVieleVersuche")
          : error instanceof ApiError
            ? error.message
            : i18n.t("fehler.serverNichtErreichbar");
      set({ status: "abgemeldet", benutzer: null, fehler });
      return false;
    }
  },

  async abmelden() {
    try {
      await authApi.logout();
    } finally {
      set({ status: "abgemeldet", benutzer: null });
    }
  },

  sitzungVerloren: () => set({ status: "abgemeldet", benutzer: null }),
}));
