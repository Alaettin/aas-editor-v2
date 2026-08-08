import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { ArrowRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { useProjects } from "@/store/projects";

/**
 * Das Detailpanel rechts: was gerade gewaehlt ist, seine Kennzahlen, seine Teilmodelle und
 * die drei Aktionen.
 *
 * Die Kennzahlen stehen bereits in der Zeile, sie kosten keinen Abruf. Nachgeladen wird nur
 * die Teilmodell-Liste, und zwar ueber `/uebersicht` und nicht ueber die Detailroute: die
 * lieferte das ganze Environment, also bei einem grossen Modell einige Megabyte fuer eine
 * Handvoll Namen.
 *
 * Seit dem 08.08.2026 in der Erscheinung des Editors. Die drei Aktionen tragen dieselben
 * drei Knopfarten wie dort: gefuellt, umrandet, warnfarben.
 */

interface Props {
  readonly onExport: (projekt: { id: string; name: string }) => void;
  readonly onLoeschen: (projekt: { id: string; name: string }) => void;
}

function Kennzahl({
  titel,
  wert,
  auffaellig = false,
}: {
  readonly titel: string;
  readonly wert: number | string;
  /** Befunde stehen in Orange, sobald es welche gibt. Rot bleibt dem Loeschen vorbehalten. */
  readonly auffaellig?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between bg-card px-3 py-2.5">
      <span className="font-mono text-3xs tracking-(--tracking-etikett) text-mono-foreground uppercase">
        {titel}
      </span>
      <span
        className={"text-2xl " + (auffaellig ? "text-warning-text" : "text-foreground")}
        data-numeric
      >
        {wert}
      </span>
    </div>
  );
}

export function Detailleiste({ onExport, onLoeschen }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const auswahlId = useProjects((state) => state.auswahlId);
  const projekte = useProjects((state) => state.projekte);
  const detail = useProjects((state) => state.detail);
  const detailLaedt = useProjects((state) => state.detailLaedt);

  // Die Zeile ist die Quelle der Kennzahlen. Sie steht sofort bereit, waehrend die
  // Teilmodell-Liste und die Befundzahl noch laden.
  const projekt = projekte.find((eintrag) => eintrag.id === auswahlId) ?? null;
  const datum = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });

  return (
    <aside className="flex w-(--w-einstiegsdetail) shrink-0 flex-col gap-5 border-l border-border bg-sidebar px-4 py-5">
      {projekt === null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center">
          <p className="text-md text-secondary-foreground">{t("projekte.nichtsGewaehlt")}</p>
          <p className="text-sm text-foreground-faint">{t("projekte.nichtsGewaehltText")}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <SectionLabel>{t("projekte.ausgewaehlt")}</SectionLabel>
            <h2 className="text-xl leading-tight text-foreground">{projekt.name}</h2>
            <span className="font-mono text-2xs text-foreground-faint" data-numeric>
              {t("projekte.spalteGeaendert")} {datum.format(projekt.updatedAt)}
            </span>
          </div>

          <div className="flex flex-col gap-px bg-border">
            <Kennzahl titel={t("projekte.spalteSubmodelle")} wert={projekt.submodelCount} />
            <Kennzahl titel={t("projekte.spalteElemente")} wert={projekt.nodeCount} />
            {/*
              Die Befundzahl kommt vom Server und braucht dafuer eine Validierung. Solange
              sie unterwegs ist, steht hier ein Strich und keine Null: eine Null waere eine
              Aussage, die noch niemand gepruefet hat.
            */}
            <Kennzahl
              titel={t("projekte.befunde")}
              wert={detail ? detail.befunde : "–"}
              auffaellig={(detail?.befunde ?? 0) > 0}
            />
          </div>

          <div className="flex min-h-0 flex-col gap-2">
            <SectionLabel>{t("projekte.submodelle")}</SectionLabel>

            {detailLaedt ? (
              <Loader2 aria-hidden className="size-4 animate-spin text-foreground-faint" />
            ) : detail && detail.submodelle.length === 0 ? (
              <p className="text-sm text-foreground-faint">{t("projekte.ohneSubmodelle")}</p>
            ) : (
              <ul className="flex min-h-0 flex-col overflow-y-auto">
                {(detail?.submodelle ?? []).map((submodel) => (
                  <li
                    key={submodel.id}
                    className="flex items-center gap-2.5 border-b border-border-row py-2"
                  >
                    <span aria-hidden className="size-1.25 shrink-0 rounded-full bg-type-sm" />
                    <span className="truncate font-mono text-2xs">
                      {submodel.idShort ?? t("projekte.ohneIdShort")}
                    </span>
                    <span
                      className="ml-auto shrink-0 font-mono text-2xs text-mono-foreground"
                      data-numeric
                    >
                      {submodel.elementCount} {t("projekte.elementeKurz")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-auto flex flex-col gap-2">
            <Button size="lg" onClick={() => void navigate(`/editor/${projekt.id}`)}>
              {t("projekte.oeffnen")}
              <ArrowRight aria-hidden data-icon="inline-end" />
            </Button>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onExport({ id: projekt.id, name: projekt.name })}
              >
                {t("projekte.exportieren")}
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => onLoeschen({ id: projekt.id, name: projekt.name })}
              >
                {t("projekte.loeschen")}
              </Button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
