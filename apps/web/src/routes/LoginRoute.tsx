import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { ArrowRight } from "lucide-react";

import logo from "@/assets/neoception-weiss.png";
import { AxonKeyvisual } from "@/components/Keyvisual/AxonKeyvisual";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useAnsicht } from "@/store/ansicht";
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
 * Unter 48rem wird der Canvas gar nicht erst gemountet: die Vorlage skaliert mit dem
 * Fenster, auf einem Telefon bliebe nur ein Band unter der Karte.
 */
export function LoginRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAuth((state) => state.status);
  const fehler = useAuth((state) => state.fehler);
  const anmelden = useAuth((state) => state.anmelden);

  const language = useAnsicht((state) => state.language);
  const setLanguage = useAnsicht((state) => state.setLanguage);

  const breit = useMediaQuery("(min-width: 48rem)");
  const karteRef = useRef<HTMLFormElement>(null);

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
    "h-(--h-anmeldefeld) border-b border-axon-feld-rand bg-transparent text-md text-axon-schrift " +
    "outline-none transition-colors duration-(--duration-calm) focus:border-axon-fokus";
  const etikett =
    "font-mono text-3xs tracking-(--tracking-etikett) text-axon-schrift-still uppercase";

  return (
    <main className="szene-axon relative flex h-screen min-h-(--h-anmeldebuehne) items-center justify-center overflow-hidden bg-axon-grund px-6 md:px-0">
      {breit ? <AxonKeyvisual kartenRef={karteRef} /> : null}

      {/*
        Die Wortmarke liegt ueber der Buehne, oben links, wie in der Vorgabe. Die weisse
        Fassung entsteht aus der schwarzen ueber `scripts/make-logo-weiss.mjs`; auf Blau
        waere die Vorlage zur Haelfte unsichtbar.
      */}
      <img
        src={logo}
        alt={t("anmeldung.marke")}
        className="absolute top-8 left-9 z-10 w-(--w-anmeldelogo)"
      />

      <form
        ref={karteRef}
        onSubmit={(event) => void absenden(event)}
        /*
         * Rand und Schein leiten sich aus `--axon-blitz` ab, das die Buehne beim Eintreffen
         * eines Datenpakets schreibt. So bleibt React aus dem Takt der Animation.
         */
        style={{
          borderColor:
            "color-mix(in srgb, var(--axon-fokus) calc(var(--axon-blitz) * 50%), var(--axon-karte-rand))",
          boxShadow:
            "0 0 calc(20px + var(--axon-blitz) * 40px) rgb(var(--axon-fokus-kanaele) / calc(var(--axon-blitz) * 0.16))",
        }}
        /*
         * Zwei Gestalten, eine Flaeche. Schmal bleibt es die Karte: sie steht mittig und
         * traegt ringsum einen Rand. Ab 48rem wird daraus die Leiste aus Vorlage v4, die
         * am rechten Rand klebt und die volle Hoehe fuellt; dann bleibt nur die linke
         * Haarlinie, denn die drei anderen Kanten liegen am Bildrand.
         */
        className="relative flex w-full max-w-(--w-anmeldekarte) flex-col gap-6.5 overflow-hidden rounded-[2px] border bg-axon-anmeldung px-8.5 pt-8.5 pb-6.5 backdrop-blur-(--blur-anmeldung) md:absolute md:inset-y-0 md:right-0 md:w-(--w-anmeldeleiste) md:max-w-none md:min-w-(--min-w-anmeldeleiste) md:justify-center md:gap-8.5 md:rounded-none md:border-0 md:border-l md:py-0 md:pr-(--pr-anmeldeleiste) md:pl-(--pl-anmeldeleiste)"
      >
        {/* Die Lichtkante links, mit einem Punkt, der sie hinabwandert. */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-px"
          style={{ backgroundImage: "var(--axon-kante)" }}
        />
        <span
          aria-hidden
          className="absolute -left-0.5 size-1.25 rounded-full bg-axon-schrift [animation:axon-kante_5.5s_linear_infinite]"
          style={{ boxShadow: "0 0 12px 3px rgb(var(--axon-fokus-kanaele) / 0.7)" }}
        />

        {/*
          Der atmende Punkt sass frueher an einer Augenbraue ueber dem Titel. Die
          Augenbraue sagte dasselbe wie der Titel jetzt, also ist sie weg und der Punkt
          steht direkt daneben.
        */}
        <h1 className="flex items-center gap-3 font-display text-3xl font-light tracking-tight text-axon-schrift">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full bg-axon-fokus [animation:axon-atem_2.8s_ease-in-out_infinite]"
          />
          {t("anmeldung.titel")}
        </h1>

        <div className="flex flex-col gap-5">
          <label className="flex flex-col gap-2.25" htmlFor="benutzer">
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

          <label className="flex flex-col gap-2.25" htmlFor="passwort">
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

        <div className="flex flex-col gap-5">
          {fehler ? (
            <p role="alert" className="text-sm text-axon-fehler">
              {fehler}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={laeuft || benutzer === ""}
            aria-busy={laeuft}
            className="flex h-(--h-anmeldeknopf) items-center justify-between rounded-[2px] border border-axon-aktion px-5 text-sm tracking-(--tracking-aktion) text-axon-schrift uppercase transition-colors duration-(--duration-calm) hover:border-axon-aktion-hover hover:bg-axon-aktion disabled:pointer-events-none disabled:opacity-40"
          >
            <span>{laeuft ? t("anmeldung.laeuft") : t("anmeldung.anmelden")}</span>
            <ArrowRight className="size-4" />
          </button>

          <div className="flex items-center justify-between font-mono text-2xs tracking-(--tracking-fein) text-axon-schrift-fein">
            {/*
              Die Sprachwahl gilt sofort und ueberdauert das Neuladen: sie liegt im selben
              Speicher wie Erscheinung und Dichte.
            */}
            <div role="group" aria-label={t("anmeldung.sprache")} className="flex items-center">
              {(["de", "en"] as const).map((wert, i) => (
                <span key={wert} className="flex items-center">
                  {i > 0 ? (
                    <span aria-hidden className="text-axon-schrift-fein">
                      /
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-pressed={language === wert}
                    onClick={() => setLanguage(wert)}
                    className={
                      "px-1 transition-colors duration-(--duration-calm) " +
                      (language === wert
                        ? "text-axon-schrift-still"
                        : "hover:text-axon-schrift-still")
                    }
                  >
                    {wert.toUpperCase()}
                  </button>
                </span>
              ))}
            </div>

            <span data-numeric>{t("status.fassung", { nummer: __APP_VERSION__ })}</span>
          </div>
        </div>
      </form>
    </main>
  );
}
