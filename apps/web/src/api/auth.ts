import { api } from "./client";

export interface Benutzer {
  readonly id: string;
  readonly name: string;
}

export const authApi = {
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
