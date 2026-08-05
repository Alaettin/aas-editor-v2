import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { ArrowRight } from "lucide-react";

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
    <main className="szene-axon relative flex h-screen min-h-(--h-anmeldebuehne) items-center justify-center overflow-hidden bg-axon-grund px-6 md:justify-end md:px-(--x-anmeldekarte)">
      {breit ? <AxonKeyvisual kartenRef={karteRef} /> : null}

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
        className="relative flex w-full max-w-(--w-anmeldekarte) flex-col gap-6.5 overflow-hidden rounded-[2px] border bg-axon-karte px-8.5 pt-8.5 pb-6.5 backdrop-blur-(--blur-glas)"
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

        <div className="flex flex-col gap-4">
          <div className={`flex items-center gap-2.25 ${etikett} tracking-(--tracking-marke)`}>
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-axon-fokus [animation:axon-atem_2.8s_ease-in-out_infinite]"
            />
            <span>{t("anmeldung.marke")}</span>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="font-display text-3xl font-light tracking-tight text-axon-schrift">
              {t("anmeldung.titel")}
            </h1>
            <p className="max-w-[25ch] text-md leading-relaxed text-axon-schrift-leise">
              {t("anmeldung.untertitel")}
            </p>
          </div>
        </div>

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

          <p
            className="text-end font-mono text-2xs tracking-(--tracking-fein) text-axon-schrift-fein"
            data-numeric
          >
            {t("anmeldung.version", { version: __APP_VERSION__ })}
          </p>
        </div>
      </form>
    </main>
  );
}
