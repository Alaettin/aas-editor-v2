import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";

import { AxonKeyvisual } from "@/components/Keyvisual/AxonKeyvisual";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useAuth } from "@/store/auth";

/**
 * Die Anmeldung auf der AXON-Buehne.
 *
 * Bewusst rohe Eingaben und ein rohes `button` statt `ui/input.tsx` und `ui/button.tsx`:
 * deren Varianten setzen Hoehe, Radius und Farben des Editors, und die sind hier alle
 * anders. Sie zu ueberschreiben verstiesse gegen die Regel "nie Komponentenfarben
 * ueberschreiben". Die Anmeldung ist eine eigene Markenflaeche, kein Anwendungschrom, und
 * alle Werte kommen aus dem `.szene-axon`-Block in `tokens.css`.
 *
 * Unter 48rem wird der Canvas gar nicht erst gemountet: die Vorlage skaliert mit der
 * Breite, auf einem Telefon bliebe nur ein duennes Band unter der Karte.
 */
export function LoginRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAuth((state) => state.status);
  const fehler = useAuth((state) => state.fehler);
  const anmelden = useAuth((state) => state.anmelden);

  const breit = useMediaQuery("(min-width: 48rem)");

  const [benutzer, setBenutzer] = useState("");
  const [passwort, setPasswort] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  const ziel = (location.state as { von?: string } | null)?.von ?? "/projekte";

  useEffect(() => {
    if (status === "angemeldet") void navigate(ziel, { replace: true });
  }, [status, navigate, ziel]);

  const absenden = async (event: FormEvent) => {
    event.preventDefault();
    setLaeuft(true);
    const erfolg = await anmelden(benutzer, passwort);
    setLaeuft(false);
    if (erfolg) void navigate(ziel, { replace: true });
  };

  const feld =
    "h-(--h-anmeldefeld) rounded-xs border border-axon-feld-rand bg-axon-feld px-3.5 " +
    "text-base text-axon-schrift transition-colors duration-(--duration-quick) " +
    "focus:border-axon-fokus focus:bg-axon-feld-aktiv";
  const etikett = "text-2xs tracking-(--tracking-etikett) text-axon-schrift-leise uppercase";

  return (
    <main className="szene-axon relative flex h-screen min-h-(--h-anmeldebuehne) items-center justify-center overflow-hidden bg-axon-grund px-6 md:justify-end md:px-(--x-anmeldekarte)">
      {breit ? <AxonKeyvisual /> : null}

      <form
        onSubmit={(event) => void absenden(event)}
        className="relative flex w-full max-w-(--w-anmeldekarte) flex-col gap-5.5 rounded-xs border border-axon-karte-rand bg-axon-karte px-9 pt-10 pb-9 backdrop-blur-(--blur-glas)"
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="size-2.25 rounded-full bg-axon-schrift" />
            <span
              className={`text-xs tracking-(--tracking-marke) text-axon-schrift-leise uppercase`}
            >
              {t("anmeldung.marke")}
            </span>
          </div>
          <h1 className="font-display text-2xl font-normal text-axon-schrift">
            {t("anmeldung.titel")}
          </h1>
        </div>

        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.75" htmlFor="benutzer">
            <span className={etikett}>{t("anmeldung.benutzer")}</span>
            <input
              id="benutzer"
              name="benutzer"
              autoComplete="username"
              autoFocus
              value={benutzer}
              onChange={(event) => setBenutzer(event.target.value)}
              className={feld}
            />
          </label>

          <label className="flex flex-col gap-1.75" htmlFor="passwort">
            <span className={etikett}>{t("anmeldung.passwort")}</span>
            <input
              id="passwort"
              name="passwort"
              type="password"
              autoComplete="current-password"
              value={passwort}
              onChange={(event) => setPasswort(event.target.value)}
              className={feld}
            />
          </label>
        </div>

        <div className="flex flex-col gap-4">
          {fehler ? (
            <p role="alert" className="text-sm text-axon-fehler">
              {fehler}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={laeuft || benutzer === ""}
            aria-busy={laeuft}
            className="h-(--h-anmeldeknopf) rounded-xs bg-axon-aktion text-sm tracking-(--tracking-aktion) text-axon-schrift uppercase transition-colors duration-(--duration-quick) hover:bg-axon-aktion-hover disabled:pointer-events-none disabled:opacity-50"
          >
            {laeuft ? t("anmeldung.laeuft") : t("anmeldung.anmelden")}
          </button>

          <p className="text-end text-sm text-axon-schrift-still" data-numeric>
            {t("anmeldung.version", { version: __APP_VERSION__ })}
          </p>
        </div>
      </form>
    </main>
  );
}
