import { useTranslation } from "react-i18next";

import logo from "@/assets/neoception-weiss.png";
import { useAnsicht } from "@/store/ansicht";
import { useAuth } from "@/store/auth";
import { useProjects, type Zeitfenster } from "@/store/projects";

/**
 * Die linke Leiste des Einstiegs: Marke, Navigation, Filter, Fussbereich.
 *
 * Wie bei der Anmeldung rohe Elemente statt `ui/button.tsx` und Freunde: deren Varianten
 * setzen Hoehe, Radius und Farben des Editors, und die sind auf der Markenflaeche alle
 * anders. Alle Werte kommen aus `.szene-axon` in `tokens.css`.
 */

const ETIKETT =
  "font-mono text-3xs tracking-(--tracking-etikett) text-axon-schrift-still uppercase";

const ZEITFENSTER: readonly Zeitfenster[] = ["heute", "woche", "monat"];

const ZEIT_SCHLUESSEL: Record<Zeitfenster, string> = {
  alle: "projekte.zeitAlle",
  heute: "projekte.zeitHeute",
  woche: "projekte.zeitWoche",
  monat: "projekte.zeitMonat",
};

interface GruppeProps {
  readonly titel: string;
  readonly gefuellt: boolean;
  readonly onLeeren: () => void;
  readonly children: React.ReactNode;
}

function Gruppe({ titel, gefuellt, onLeeren, children }: GruppeProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2 px-2 pb-2">
        <span className={ETIKETT}>{titel}</span>
        {/*
          Der Knopf verschwindet nicht, wenn nichts gewaehlt ist, er wird nur unsichtbar
          und unerreichbar. So springt die Ueberschrift nicht, wenn ein Filter greift.
        */}
        <button
          type="button"
          onClick={onLeeren}
          hidden={!gefuellt}
          className="ml-auto font-mono text-3xs tracking-(--tracking-fein) text-axon-fokus hover:underline"
        >
          {t("projekte.zuruecksetzen")}
        </button>
      </div>
      {children}
    </div>
  );
}

export function Seitenleiste({ onEinstellungen }: { readonly onEinstellungen: () => void }) {
  const { t } = useTranslation();

  const total = useProjects((state) => state.total);
  const filter = useProjects((state) => state.filter);
  const setzeZeitfenster = useProjects((state) => state.setzeZeitfenster);

  const benutzer = useAuth((state) => state.benutzer);
  const abmelden = useAuth((state) => state.abmelden);
  const language = useAnsicht((state) => state.language);
  const setLanguage = useAnsicht((state) => state.setLanguage);

  const kuerzel = (benutzer?.name ?? "").slice(0, 2).toUpperCase();

  return (
    <aside className="relative z-10 flex w-(--w-einstiegsleiste) shrink-0 flex-col gap-7 border-r border-axon-linie bg-axon-flaeche px-4.5 py-6.5">
      <div className="flex flex-col gap-3.5 border-b border-axon-linie px-2.5 pt-1.5 pb-4.5">
        {/*
          Dieselbe weisse Wortmarke wie auf der Anmeldung. Sie entsteht aus der schwarzen
          Vorlage ueber `scripts/make-logo-weiss.mjs`; auf Blau waere das Original zur
          Haelfte unsichtbar.
        */}
        <img src={logo} alt={t("anmeldung.marke")} className="w-(--w-einstiegslogo)" />
        <span className={ETIKETT}>{t("projekte.marke")}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6.5 overflow-y-auto">
        <nav className="flex flex-col gap-0.5" aria-label={t("projekte.arbeitsbereich")}>
          <span className={`${ETIKETT} px-2 pb-2`}>{t("projekte.arbeitsbereich")}</span>

          <span
            aria-current="page"
            className="flex items-center gap-2.5 border-l-2 border-axon-fokus bg-axon-zeile-aktiv px-2 py-2.5 text-sm text-axon-schrift"
          >
            <span aria-hidden className="size-1.25 rounded-full bg-axon-fokus" />
            {t("projekte.navProjekte")}
            <span className="ml-auto font-mono text-2xs text-axon-schrift-still" data-numeric>
              {total}
            </span>
          </span>

          {/*
            Das Repository ist angekuendigt, aber noch nicht gebaut. Es steht deshalb hier
            und ist ausdruecklich abgeschaltet, statt einen Klick ins Leere anzubieten.
          */}
          <span
            aria-disabled="true"
            className="flex items-center gap-2.5 border-l-2 border-transparent px-2 py-2.5 text-sm text-axon-schrift-still"
          >
            <span aria-hidden className="size-1.25 rounded-full bg-axon-schrift-fein" />
            {t("projekte.navRepository")}
          </span>
        </nav>

        <Gruppe
          titel={t("projekte.filterZeitraum")}
          gefuellt={filter.zeitfenster !== "alle"}
          onLeeren={() => setzeZeitfenster("alle")}
        >
          {/*
            Ohne Zaehler, und das ist Absicht: "Heute" haengt an der Zeitzone des
            Betrachters. Der Server koennte nur seine eigene zaehlen und laege damit
            regelmaessig daneben.

            Ein Zeitraum schliesst den anderen aus, deshalb Radio und nicht Checkbox.
          */}
          <div role="radiogroup" aria-label={t("projekte.filterZeitraum")}>
            {ZEITFENSTER.map((fenster) => (
              <button
                key={fenster}
                type="button"
                role="radio"
                aria-checked={filter.zeitfenster === fenster}
                onClick={() => setzeZeitfenster(filter.zeitfenster === fenster ? "alle" : fenster)}
                className={
                  "flex w-full items-center gap-2.5 px-2 py-1.75 text-left text-sm transition-colors duration-(--duration-quick) " +
                  (filter.zeitfenster === fenster
                    ? "bg-axon-zeile-aktiv text-axon-schrift"
                    : "text-axon-schrift-leise hover:bg-axon-zeile-hover hover:text-axon-schrift")
                }
              >
                <span
                  aria-hidden
                  className={
                    "size-2.5 shrink-0 rounded-full border " +
                    (filter.zeitfenster === fenster
                      ? "border-axon-fokus bg-axon-fokus"
                      : "border-axon-feld-rand")
                  }
                />
                {t(ZEIT_SCHLUESSEL[fenster])}
              </button>
            ))}
          </div>
        </Gruppe>
      </div>

      <div className="flex flex-col gap-3.5">
        <div className="px-2 font-mono text-2xs tracking-(--tracking-fein) text-axon-schrift-still">
          <span data-numeric>{__APP_VERSION__}</span>
        </div>

        <div className="flex items-center gap-3.5 border-t border-axon-linie px-2 pt-3.5 font-mono text-2xs tracking-(--tracking-fein) text-axon-schrift-still">
          <button
            type="button"
            onClick={onEinstellungen}
            className="tracking-(--tracking-fein) uppercase transition-colors duration-(--duration-calm) hover:text-axon-schrift"
          >
            {t("projekte.einstellungen")}
          </button>
          <div
            role="group"
            aria-label={t("anmeldung.sprache")}
            className="ml-auto flex items-center"
          >
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
                    (language === wert ? "text-axon-schrift" : "hover:text-axon-schrift")
                  }
                >
                  {wert.toUpperCase()}
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2.5 border-t border-axon-linie px-2 pt-3.5">
          <span
            aria-hidden
            className="flex size-7 items-center justify-center rounded-full border border-axon-aktion bg-axon-aktion/25 text-2xs text-axon-schrift"
          >
            {kuerzel}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm text-axon-schrift">{benutzer?.name}</span>
            <button
              type="button"
              onClick={() => void abmelden()}
              className="text-left font-mono text-3xs tracking-(--tracking-fein) text-axon-schrift-still hover:text-axon-schrift"
            >
              {t("anmeldung.abmelden")}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
