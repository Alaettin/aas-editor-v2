import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { ArrowRight } from "lucide-react";

import { Marke } from "@/components/Shell/Marke";
import { Sprachknopf } from "@/components/Shell/Sprachknopf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/section-label";
import { useAuth } from "@/store/auth";

/**
 * Die Anmeldung.
 *
 * Bis zum 08.08.2026 war sie eine eigene Markenflaeche: ein Canvas-Keyvisual, eine Leiste
 * am rechten Rand, eine Lichtkante mit wanderndem Punkt und rohe Eingaben, weil die
 * Bauteile des Editors dort nicht passten. Sie sah damit aus wie der Hub, obwohl sie zu
 * einem anderen Produkt gehoert. Jetzt traegt sie dieselbe Flaeche und dieselben Bauteile
 * wie Einstieg und Editor: eine Karte in der Mitte, darueber die Marke.
 */
export function LoginRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAuth((state) => state.status);
  const fehler = useAuth((state) => state.fehler);
  const anmelden = useAuth((state) => state.anmelden);
  const modus = useAuth((state) => state.modus);
  const hoereModus = useAuth((state) => state.hoereModus);

  const [benutzer, setBenutzer] = useState("");
  const [passwort, setPasswort] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  const ziel = (location.state as { von?: string } | null)?.von ?? "/projekte";

  useEffect(() => {
    if (status === "angemeldet") void navigate(ziel, { replace: true });
  }, [status, navigate, ziel]);

  useEffect(() => {
    if (modus === null) void hoereModus();
  }, [modus, hoereModus]);

  /*
   * Der Grund eines gescheiterten Rueckwegs steht in der Adresse, nicht im Speicher: der
   * Server hat hierher **umgeleitet**, die Seite wurde also neu geladen und jeder Zustand
   * von vorher ist weg.
   */
  const hubFehlerSchluessel = new URLSearchParams(location.search).get("fehler");
  const hubFehler = hubFehlerSchluessel
    ? t(`anmeldung.hubFehler.${hubFehlerSchluessel}`, {
        defaultValue: t("anmeldung.hubFehler.unbekannt"),
      })
    : null;

  const absenden = async (event: FormEvent) => {
    event.preventDefault();
    setLaeuft(true);
    const erfolg = await anmelden(benutzer, passwort);
    setLaeuft(false);
    if (erfolg) void navigate(ziel, { replace: true });
  };

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-8 overflow-y-auto bg-background px-6 py-10">
      <Marke groesse="gross" />

      <form
        onSubmit={(event) => void absenden(event)}
        className="flex w-full max-w-(--w-anmeldekarte) flex-col gap-6 rounded-lg border border-border bg-card px-7 py-6"
      >
        {/*
          Kein Titel in der Karte: die Marke steht unmittelbar darueber und sagte dasselbe
          noch einmal.
        */}
        {/*
          Zwei Spielarten, eine Karte. Solange `modus` noch nicht da ist, steht hier
          nichts: ein Formular, das eine Zehntelsekunde spaeter durch eine Schaltflaeche
          ersetzt wird, sieht nach einem Fehler aus.
        */}
        {modus === "passwort" ? (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2" htmlFor="benutzer">
              <SectionLabel>{t("anmeldung.benutzer")}</SectionLabel>
              <Input
                id="benutzer"
                name="benutzer"
                autoComplete="username"
                autoFocus
                value={benutzer}
                onChange={(event) => setBenutzer(event.target.value)}
              />
            </label>

            <label className="flex flex-col gap-2" htmlFor="passwort">
              <SectionLabel>{t("anmeldung.passwort")}</SectionLabel>
              <Input
                id="passwort"
                name="passwort"
                type="password"
                autoComplete="current-password"
                value={passwort}
                onChange={(event) => setPasswort(event.target.value)}
              />
            </label>
          </div>
        ) : modus === "oidc" ? (
          <p className="text-sm text-muted-foreground">{t("anmeldung.hubHinweis")}</p>
        ) : null}

        {hubFehler ?? fehler ? (
          <p role="alert" className="text-sm text-destructive">
            {hubFehler ?? fehler}
          </p>
        ) : null}

        {modus === "oidc" ? (
          /*
            Ein Anker, kein Knopf mit onClick: der Weg zum Hub ist eine Navigation, und
            der Server antwortet darauf mit einer Umleitung. Ein `fetch` liefe der
            Umleitung hinterher und landete im Nichts, weil der Browser dabei nicht
            mitwandert.
          */
          <Button size="lg" asChild>
            <a href="/api/auth/anmelden">
              {t("anmeldung.ueberHub")}
              <ArrowRight data-icon="inline-end" />
            </a>
          </Button>
        ) : (
          <Button
            type="submit"
            size="lg"
            disabled={laeuft || benutzer === "" || modus === null}
            aria-busy={laeuft}
          >
            {laeuft ? t("anmeldung.laeuft") : t("anmeldung.anmelden")}
            <ArrowRight data-icon="inline-end" />
          </Button>
        )}

        <div className="flex items-center justify-between border-t border-border-subtle pt-4">
          {/*
            Die Sprachwahl gilt sofort und ueberdauert das Neuladen. Derselbe Knopf steht
            in der Titelzeile von Einstieg und Editor.
          */}
          <Sprachknopf />
          <span className="font-mono text-2xs text-mono-foreground" data-numeric>
            {t("status.fassung", { nummer: __APP_VERSION__ })}
          </span>
        </div>
      </form>
    </main>
  );
}
