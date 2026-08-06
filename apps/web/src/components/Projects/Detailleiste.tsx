import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { ArrowRight, Loader2 } from "lucide-react";

import { useProjects } from "@/store/projects";

/**
 * Das Detailpanel rechts: was gerade gewaehlt ist, seine Kennzahlen, seine Teilmodelle und
 * die drei Aktionen.
 *
 * Die Kennzahlen stehen bereits in der Zeile, sie kosten keinen Abruf. Nachgeladen wird nur
 * die Teilmodell-Liste, und zwar ueber `/uebersicht` und nicht ueber die Detailroute: die
 * lieferte das ganze Environment, also bei einem grossen Modell einige Megabyte fuer eine
 * Handvoll Namen.
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
    <div className="flex items-baseline justify-between bg-axon-kachel px-4 py-3.5">
      <span className="font-mono text-3xs tracking-(--tracking-etikett) text-axon-schrift-still uppercase">
        {titel}
      </span>
      <span
        className="text-2xl"
        style={{ color: auffaellig ? "var(--axon-strom-orange)" : "var(--axon-schrift)" }}
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
    <aside className="relative z-10 flex w-(--w-einstiegsdetail) shrink-0 flex-col gap-6.5 border-l border-axon-linie bg-axon-flaeche px-6 py-6.5">
      {projekt === null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center">
          <p className="text-md text-axon-schrift-leise">{t("projekte.nichtsGewaehlt")}</p>
          <p className="text-sm text-axon-schrift-still">{t("projekte.nichtsGewaehltText")}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            <span className="font-mono text-3xs tracking-(--tracking-etikett) text-axon-schrift-still uppercase">
              {t("projekte.ausgewaehlt")}
            </span>
            <h2 className="text-xl leading-tight text-axon-schrift">{projekt.name}</h2>
            <span className="font-mono text-2xs text-axon-schrift-still" data-numeric>
              {t("projekte.spalteGeaendert")} {datum.format(projekt.updatedAt)}
            </span>
          </div>

          <div className="flex flex-col gap-px bg-axon-linie">
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

          <div className="flex min-h-0 flex-col gap-2.5">
            <span className="font-mono text-3xs tracking-(--tracking-etikett) text-axon-schrift-still uppercase">
              {t("projekte.submodelle")}
            </span>

            {detailLaedt ? (
              <Loader2 aria-hidden className="size-4 animate-spin text-axon-schrift-still" />
            ) : detail && detail.submodelle.length === 0 ? (
              <p className="text-sm text-axon-schrift-still">{t("projekte.ohneSubmodelle")}</p>
            ) : (
              <ul className="flex min-h-0 flex-col overflow-y-auto">
                {(detail?.submodelle ?? []).map((submodel) => (
                  <li
                    key={submodel.id}
                    className="flex items-center gap-2.5 border-b border-axon-linie-fein py-2.5"
                  >
                    <span aria-hidden className="size-1.25 shrink-0 rounded-full bg-axon-aktion" />
                    <span className="truncate font-mono text-2xs text-axon-schrift">
                      {submodel.idShort ?? t("projekte.ohneIdShort")}
                    </span>
                    <span
                      className="ml-auto shrink-0 font-mono text-2xs text-axon-schrift-still"
                      data-numeric
                    >
                      {submodel.elementCount} {t("projekte.elementeKurz")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-auto flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => void navigate(`/editor/${projekt.id}`)}
              className="flex h-(--h-einstiegsknopf) items-center justify-between bg-axon-aktion px-4.5 text-2xs tracking-(--tracking-aktion) text-axon-aktion-schrift uppercase transition-colors duration-(--duration-calm) hover:bg-axon-aktion-hover"
            >
              <span>{t("projekte.oeffnen")}</span>
              <ArrowRight aria-hidden className="size-4" />
            </button>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => onExport({ id: projekt.id, name: projekt.name })}
                className="h-(--h-einstiegsfeld) flex-1 border border-axon-feld-rand text-2xs text-axon-schrift-leise transition-colors duration-(--duration-calm) hover:border-axon-fokus hover:text-axon-schrift"
              >
                {t("projekte.exportieren")}
              </button>
              <button
                type="button"
                onClick={() => onLoeschen({ id: projekt.id, name: projekt.name })}
                className="h-(--h-einstiegsfeld) flex-1 border border-axon-fehler-kraeftig text-2xs text-axon-fehler transition-colors duration-(--duration-calm) hover:bg-axon-fehler-kraeftig hover:text-axon-schrift"
              >
                {t("projekte.loeschen")}
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
