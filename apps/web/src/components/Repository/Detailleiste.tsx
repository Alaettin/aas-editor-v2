import { useState } from "react";
import { useTranslation } from "react-i18next";
import { encodeIdentifier } from "@aas-editor/core";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { meldeFehler } from "@/lib/melden";
import { eintragVon, useRepository } from "@/store/repository";

/**
 * Rechts: die Basis-Adresse, die beiden Aufrufe im Wortlaut und die Aktion zum gewaehlten
 * Teilmodell.
 *
 * Die Adresse steht immer da, auch ohne Auswahl. Sie ist der eigentliche Ertrag dieses
 * Bildschirms: alles andere laesst sich auch im Editor sehen, diese Zeichenkette nirgends
 * sonst.
 */

function Kopierbar({
  wert,
  bezeichnung,
}: {
  readonly wert: string;
  readonly bezeichnung: string;
}) {
  const { t } = useTranslation();
  const [kopiert, setKopiert] = useState(false);

  const kopiere = async () => {
    try {
      await navigator.clipboard.writeText(wert);
      setKopiert(true);
      // Zuruecksetzen, damit ein zweites Kopieren wieder eine Rueckmeldung gibt.
      setTimeout(() => setKopiert(false), 1600);
    } catch (error) {
      // Ohne sicheren Kontext (http, kein localhost) gibt es keine Zwischenablage. Das
      // stillschweigend zu schlucken hiesse: der Knopf tut nichts und sagt nichts.
      meldeFehler(error, "repository.kopierenFehlgeschlagen");
    }
  };

  return (
    <div className="flex items-start gap-1.5">
      <code className="min-w-0 flex-1 rounded-(--radius-sm) bg-card px-2 py-1.5 font-mono text-2xs break-all text-secondary-foreground">
        {wert}
      </code>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t("repository.kopieren", { was: bezeichnung })}
        onClick={() => void kopiere()}
      >
        {kopiert ? <Check aria-hidden /> : <Copy aria-hidden />}
      </Button>
    </div>
  );
}

export function Detailleiste() {
  const { t, i18n } = useTranslation();

  const info = useRepository((state) => state.info);
  const eintraege = useRepository((state) => state.eintraege);
  const auswahlId = useRepository((state) => state.auswahlId);
  const entfernen = useRepository((state) => state.entfernen);

  const eintrag = eintragVon(eintraege, auswahlId);
  const datum = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });

  if (info === null) return null;

  return (
    <aside className="flex w-(--w-einstiegsdetail) shrink-0 flex-col gap-5 overflow-y-auto border-l border-border bg-sidebar px-4 py-5">
      <div className="flex flex-col gap-2">
        <SectionLabel>{t("repository.basisAdresse")}</SectionLabel>
        <Kopierbar wert={info.basisAdresse} bezeichnung={t("repository.basisAdresse")} />
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>{t("repository.aufrufAlle")}</SectionLabel>
        <Kopierbar
          wert={`${info.basisAdresse}/submodels`}
          bezeichnung={t("repository.aufrufAlle")}
        />
      </div>
      {/*
        Der Aufruf fuer ein einzelnes Teilmodell steht **nur** bei einer Auswahl, und dann
        mit der echten, kodierten id. Vorher stand hier ohne Auswahl ein Platzhalter
        `{base64url-id}`. Eine kopierte Adresse, in die man erst noch etwas einsetzen muss,
        ist keine Adresse: IDTA-01002 adressiert base64url, und wer stattdessen die id im
        Klartext einsetzt, schiebt eine IRI samt Schraegstrichen in den Pfad. Zeigen laesst
        sich das nur fertig oder gar nicht.
      */}

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <SectionLabel>{t("repository.ausgewaehlt")}</SectionLabel>

        {eintrag === null ? (
          <p className="text-sm text-foreground-faint">{t("repository.nichtsGewaehlt")}</p>
        ) : (
          <>
            <h2 className="text-lg leading-tight text-foreground">
              {eintrag.idShort ?? t("projekte.ohneIdShort")}
            </h2>
            <dl className="flex flex-col gap-1.5 text-2xs">
              <div className="flex flex-col gap-0.5">
                <dt className="text-foreground-faint">{t("repository.spalteHerkunft")}</dt>
                <dd className="text-secondary-foreground">{eintrag.herkunftProjektName}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-foreground-faint">{t("repository.spalteUebernommen")}</dt>
                <dd className="font-mono text-secondary-foreground" data-numeric>
                  {datum.format(eintrag.uebernommenAm)}
                </dd>
              </div>
              {/* Nur wenn er sich unterscheidet: sonst steht dieselbe Zeit zweimal da und
                  sieht aus wie eine Aussage, die es nicht ist. */}
              {eintrag.updatedAt !== eintrag.uebernommenAm ? (
                <div className="flex flex-col gap-0.5">
                  <dt className="text-foreground-faint">{t("repository.nachgezogen")}</dt>
                  <dd className="font-mono text-secondary-foreground" data-numeric>
                    {datum.format(eintrag.updatedAt)}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="flex flex-col gap-1.5">
              <SectionLabel>{t("repository.aufrufEines")}</SectionLabel>
              <Kopierbar
                wert={`${info.basisAdresse}/submodels/${encodeIdentifier(eintrag.id)}`}
                bezeichnung={t("repository.aufrufEines")}
              />
            </div>

            <Button
              variant="destructive"
              className="mt-auto"
              onClick={() => void entfernen(eintrag.id)}
            >
              {t("repository.entfernen")}
            </Button>
          </>
        )}
      </div>
    </aside>
  );
}
