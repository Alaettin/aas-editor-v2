import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
} from "lucide-react";

import type { SortFeld } from "@/api/projects";
import { PRO_SEITE, useProjects } from "@/store/projects";

/**
 * Die Tabelle des Einstiegs samt Blaetterleiste.
 *
 * Auswahl und Oeffnen sind getrennt: ein Klick fuellt das Detailpanel rechts, ein
 * Doppelklick oder der Knopf "Oeffnen" geht in den Editor. Wer die Liste nur durchsieht,
 * soll nicht bei jedem Klick den Editor laden.
 */

interface Spalte {
  readonly feld: SortFeld;
  readonly schluessel: string;
  /** Rechtsbuendig: bei Zahlen, und bei der letzten Spalte, damit sie am Rand sitzt. */
  readonly rechts?: boolean;
}

const SPALTEN: readonly Spalte[] = [
  { feld: "name", schluessel: "projekte.spalteProjekt" },
  { feld: "nodeCount", schluessel: "projekte.spalteElemente", rechts: true },
  { feld: "submodelCount", schluessel: "projekte.spalteSubmodelle", rechts: true },
  { feld: "updatedAt", schluessel: "projekte.spalteGeaendert", rechts: true },
];

/**
 * Dieselben Spaltenbreiten fuer Kopf und Zeilen, damit nichts auseinanderlaeuft.
 *
 * Die Zahlenspalten richten sich nach ihrer **Ueberschrift**, nicht nach ihrem Inhalt:
 * "Submodelle" ist breiter als jede Zahl, die darunter steht. Das Aenderungsdatum steht
 * ganz rechts und ist ebenfalls rechtsbuendig: sonst klebt es an der Teilmodellzahl.
 */
const RASTER = "grid grid-cols-[2.6fr_1fr_1.2fr_1.9fr] items-center gap-3";

/** Die vier gleich aussehenden Schalter der Blaetterleiste. */
const SCHALTER =
  "flex size-(--h-einstiegsschalter) items-center justify-center border border-axon-feld-rand " +
  "text-axon-schrift-leise transition-colors duration-(--duration-quick) hover:border-axon-fokus " +
  "hover:text-axon-schrift disabled:pointer-events-none disabled:opacity-40";

const FORMAT_FARBE: Record<string, string> = {
  json: "var(--axon-format-json)",
  xml: "var(--axon-format-xml)",
  aasx: "var(--axon-format-aasx)",
};

export function Projektliste() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const projekte = useProjects((state) => state.projekte);
  const total = useProjects((state) => state.total);
  const status = useProjects((state) => state.status);
  const fehler = useProjects((state) => state.fehler);
  const sort = useProjects((state) => state.sort);
  const dir = useProjects((state) => state.dir);
  const seite = useProjects((state) => state.seite);
  const auswahlId = useProjects((state) => state.auswahlId);
  const sortiereNach = useProjects((state) => state.sortiereNach);
  const geheZuSeite = useProjects((state) => state.geheZuSeite);
  const waehle = useProjects((state) => state.waehle);

  const datum = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });

  // Abgeleitet, nicht mitgefuehrt: sonst gaebe es zwei Wahrheiten ueber dieselbe Zahl.
  const seitenzahl = Math.max(1, Math.ceil(total / PRO_SEITE));
  const von = total === 0 ? 0 : (seite - 1) * PRO_SEITE + 1;
  const bis = Math.min(total, seite * PRO_SEITE);
  const seiten = Array.from({ length: seitenzahl }, (_, i) => i + 1);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-x-auto">
        {/*
          Bewusst ohne `role="row"` und ohne `aria-sort`. Beides gehoert in eine Tabelle
          oder ein Grid, und das hier ist keins: die Zeilen sind Schaltflaechen, die eine
          Auswahl setzen, keine Zellen, durch die man wandert. axe beanstandet die
          angefangene Grid-Semantik zu Recht. Welche Spalte sortiert und wie herum, sagt
          statt `aria-sort` der Name der Schaltflaeche.
        */}
        <div
          className={`${RASTER} min-w-(--min-w-einstiegstabelle) border-b border-axon-linie-fein px-8.5 py-3.5`}
        >
          {SPALTEN.map((spalte) => (
            <button
              key={spalte.feld}
              type="button"
              onClick={() => sortiereNach(spalte.feld)}
              aria-pressed={sort === spalte.feld}
              aria-label={
                sort === spalte.feld
                  ? t(dir === "asc" ? "projekte.sortiertAuf" : "projekte.sortiertAb", {
                      spalte: t(spalte.schluessel),
                    })
                  : t("projekte.sortierenNach", { spalte: t(spalte.schluessel) })
              }
              className={
                "flex min-w-0 items-center gap-1 truncate font-mono text-3xs tracking-(--tracking-etikett) uppercase transition-colors duration-(--duration-quick) hover:text-axon-schrift " +
                (sort === spalte.feld ? "text-axon-schrift" : "text-axon-schrift-still") +
                (spalte.rechts ? " justify-end" : "")
              }
            >
              {t(spalte.schluessel)}
              {sort === spalte.feld ? (
                dir === "asc" ? (
                  <ChevronUp aria-hidden className="size-3" />
                ) : (
                  <ChevronDown aria-hidden className="size-3" />
                )
              ) : null}
            </button>
          ))}
        </div>

        <div className="min-h-0 min-w-(--min-w-einstiegstabelle) flex-1 overflow-y-auto">
          {fehler ? (
            <p role="alert" className="px-8.5 py-6 text-sm text-axon-fehler">
              {fehler}
            </p>
          ) : null}

          {status === "bereit" && projekte.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-8.5 py-16 text-center">
              <p className="text-md text-axon-schrift">
                {total === 0 ? t("projekte.leerTitel") : t("projekte.keineTreffer")}
              </p>
              <p className="text-sm text-axon-schrift-still">
                {total === 0 ? t("projekte.leerText") : t("projekte.filterLeeren")}
              </p>
            </div>
          ) : null}

          {projekte.map((projekt) => (
            <div
              key={projekt.id}
              role="button"
              tabIndex={0}
              data-projekt={projekt.id}
              aria-pressed={auswahlId === projekt.id}
              onClick={() => void waehle(projekt.id)}
              onDoubleClick={() => void navigate(`/editor/${projekt.id}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void navigate(`/editor/${projekt.id}`);
                if (event.key === " ") {
                  event.preventDefault();
                  void waehle(projekt.id);
                }
              }}
              className={
                `${RASTER} cursor-pointer border-b border-axon-linie-fein px-8.5 py-3.75 transition-colors duration-(--duration-quick) ` +
                (auswahlId === projekt.id ? "bg-axon-zeile-aktiv" : "hover:bg-axon-zeile-hover")
              }
            >
              <div className="flex min-w-0 items-center gap-3">
                {/*
                  Seit die Spalte Format weg ist, ist der Punkt der einzige Ort, an dem das
                  Quellformat noch steht. Er traegt es deshalb als Beschriftung und ist
                  nicht mehr blosse Zierde.
                */}
                <span
                  role="img"
                  aria-label={projekt.sourceFormat.toUpperCase()}
                  title={projekt.sourceFormat.toUpperCase()}
                  className="size-1.5 shrink-0 rounded-full"
                  style={{
                    background: FORMAT_FARBE[projekt.sourceFormat] ?? "var(--axon-schrift-fein)",
                  }}
                />
                <span className="truncate text-sm text-axon-schrift">{projekt.name}</span>
              </div>
              <span
                className="truncate text-right font-mono text-2xs text-axon-schrift-leise"
                data-numeric
              >
                {projekt.nodeCount}
              </span>
              <span
                className="truncate text-right font-mono text-2xs text-axon-schrift-leise"
                data-numeric
              >
                {projekt.submodelCount}
              </span>
              <span
                className="truncate text-right font-mono text-2xs text-axon-schrift-still"
                data-numeric
              >
                {datum.format(projekt.updatedAt)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3 border-t border-axon-linie bg-axon-flaeche-leise px-8.5 py-4">
        <span className="font-mono text-2xs text-axon-schrift-still" data-numeric>
          {t("projekte.bereich", { von, bis, gesamt: total })}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            aria-label={t("projekte.seiteErste")}
            disabled={seite <= 1}
            onClick={() => geheZuSeite(1)}
            className={SCHALTER}
          >
            <ChevronsLeft aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            aria-label={t("projekte.seiteZurueck")}
            disabled={seite <= 1}
            onClick={() => geheZuSeite(seite - 1)}
            className={SCHALTER}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </button>

          {/*
            Bei vielen Seiten waeren alle Zahlen eine Bleiwueste. Gezeigt wird ein Fenster
            um die aktuelle Seite; die Raender bleiben ueber die Pfeile erreichbar.
          */}
          {seiten
            .filter((nummer) => Math.abs(nummer - seite) <= 2)
            .map((nummer) => (
              <button
                key={nummer}
                type="button"
                aria-label={t("projekte.seiteNummer", { nummer })}
                aria-current={nummer === seite ? "page" : undefined}
                onClick={() => geheZuSeite(nummer)}
                className={
                  "flex h-(--h-einstiegsschalter) min-w-(--h-einstiegsschalter) items-center justify-center border px-2 font-mono text-2xs transition-colors duration-(--duration-quick) " +
                  (nummer === seite
                    ? "border-axon-fokus bg-axon-fokus text-axon-grund"
                    : "border-axon-feld-rand text-axon-schrift-leise hover:border-axon-fokus hover:text-axon-schrift")
                }
              >
                {nummer}
              </button>
            ))}

          <button
            type="button"
            aria-label={t("projekte.seiteVor")}
            disabled={seite >= seitenzahl}
            onClick={() => geheZuSeite(seite + 1)}
            className={SCHALTER}
          >
            <ChevronRight aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            aria-label={t("projekte.seiteLetzte")}
            disabled={seite >= seitenzahl}
            onClick={() => geheZuSeite(seitenzahl)}
            className={SCHALTER}
          >
            <ChevronsRight aria-hidden className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
