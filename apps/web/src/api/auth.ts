import { api } from "./client";

export interface Benutzer {
  readonly id: string;
  readonly name: string;
}

/** Womit sich dieser Editor anmeldet. Entschieden im Server, nicht hier. */
export type AnmeldeModus = "passwort" | "oidc";

export const authApi = {
  /**
   * Ohne Anmeldung abrufbar, denn die Anmeldemaske muss es wissen, bevor sie etwas
   * anzeigen kann. `ohneWeiterleitung`, weil eine 401 hier nicht auf die Anmeldung lenken
   * darf: man steht schon dort.
   */
  modus: () => api<{ modus: AnmeldeModus }>("/api/auth/modus", { ohneWeiterleitung: true }),

  login: (benutzer: string, passwort: string) =>
    api<{ benutzer: Benutzer }>("/api/auth/login", {
      method: "POST",
      body: { benutzer, passwort },
      // Ein fehlgeschlagener Anmeldeversuch darf nicht auf die Anmeldung lenken,
      // man steht ja schon dort.
      ohneWeiterleitung: true,
    }),

  logout: () => api<{ abgemeldet: boolean }>("/api/auth/logout", { method: "POST" }),

  me: () => api<{ benutzer: Benutzer }>("/api/auth/me", { ohneWeiterleitung: true }),
};
