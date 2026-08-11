import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRepository } from "@/store/repository";

/**
 * Die Liste der uebernommenen Teilmodelle, und im leeren Fall der Einstieg.
 *
 * Drei Zustaende, die auseinandergehalten sein wollen: **kein Repository gestartet** (dann
 * steht hier der eine Knopf, der es startet), **gestartet und leer** (dann fehlen die
 * Teilmodelle, nicht das Repository) und die Liste. Ein gemeinsamer leerer Zustand fuer die
 * ersten beiden haette den Nutzer raten lassen, was ihm gerade fehlt.
 *
 * Dieselben Spaltenbreiten fuer Kopf und Zeilen wie in `Projects/Projektliste.tsx`, und aus
 * demselben Grund keine Grid-Semantik: die Zeilen sind Schaltflaechen, die eine Auswahl
 * setzen, keine Zellen, durch die man wandert.
 */

const RASTER = "grid grid-cols-[1.4fr_2.6fr_1.4fr_1.4fr] items-center gap-3";

export function Teilmodellliste({ onUebernehmen }: { readonly onUebernehmen: () => void }) {
  const { t, i18n } = useTranslation();

  const info = useRepository((state) => state.info);
  const eintraege = useRepository((state) => state.eintraege);
  const status = useRepository((state) => state.status);
  const fehler = useRepository((state) => state.fehler);
  const auswahlId = useRepository((state) => state.auswahlId);
  const startet = useRepository((state) => state.startet);
  const starten = useRepository((state) => state.starten);
  const waehle = useRepository((state) => state.waehle);

  const datum = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });

  if (status === "laedt" && info === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 aria-hidden className="size-5 animate-spin text-foreground-faint" />
      </div>
    );
  }

  if (fehler !== null && info === null) {
    return (
      <p role="alert" className="px-4 py-6 text-sm text-destructive">
        {fehler}
      </p>
    );
  }

  if (info === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-md text-foreground">{t("repository.nochKeinesTitel")}</p>
        <Button size="lg" disabled={startet} onClick={() => void starten()}>
          {startet ? <Loader2 aria-hidden className="animate-spin" /> : null}
          {t("repository.starten")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-x-auto">
        <div
          className={`${RASTER} min-w-(--min-w-einstiegstabelle) border-b border-border px-4 py-2`}
        >
          {[
            "repository.spalteIdShort",
            "repository.spalteId",
            "repository.spalteHerkunft",
            "repository.spalteUebernommen",
          ].map((schluessel) => (
            <span
              key={schluessel}
              className="truncate font-mono text-3xs tracking-(--tracking-etikett) text-mono-foreground uppercase"
            >
              {t(schluessel)}
            </span>
          ))}
        </div>

        <div className="min-h-0 min-w-(--min-w-einstiegstabelle) flex-1 overflow-y-auto">
          {fehler !== null ? (
            <p role="alert" className="px-4 py-6 text-sm text-destructive">
              {fehler}
            </p>
          ) : null}

          {eintraege.length === 0 && status === "bereit" ? (
            <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
              <p className="text-md text-foreground">{t("repository.leerTitel")}</p>
              <p className="max-w-(--w-einstiegssuche) text-sm text-foreground-faint">
                {t("repository.leerText")}
              </p>
              <Button variant="outline" onClick={onUebernehmen}>
                {t("repository.uebernehmen")}
              </Button>
            </div>
          ) : null}

          {eintraege.map((eintrag) => (
            <div
              key={eintrag.id}
              role="button"
              tabIndex={0}
              data-teilmodell={eintrag.id}
              aria-pressed={auswahlId === eintrag.id}
              onClick={() => waehle(eintrag.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  waehle(eintrag.id);
                }
              }}
              className={
                `${RASTER} cursor-pointer border-b border-border-row px-4 py-2.5 transition-colors duration-(--duration-quick) ` +
                (auswahlId === eintrag.id
                  ? "bg-selected text-selected-foreground"
                  : "hover:bg-muted")
              }
            >
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-type-sm" />
                <span className="truncate text-base" title={eintrag.idShort ?? undefined}>
                  {eintrag.idShort ?? t("projekte.ohneIdShort")}
                </span>
              </div>
              <span
                className="truncate font-mono text-2xs text-mono-foreground"
                title={eintrag.id}
              >
                {eintrag.id}
              </span>
              <span
                className="truncate font-mono text-2xs text-mono-foreground"
                title={eintrag.herkunftProjektName}
              >
                {eintrag.herkunftProjektName}
              </span>
              <span
                className="truncate font-mono text-2xs text-foreground-faint"
                data-numeric
              >
                {datum.format(eintrag.uebernommenAm)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex h-(--h-statusbar) shrink-0 items-center border-t border-border bg-card px-4">
        <span className="font-mono text-xs text-mono-foreground" data-numeric>
          {t("repository.anzahl", { count: eintraege.length })}
        </span>
      </div>
    </div>
  );
}
