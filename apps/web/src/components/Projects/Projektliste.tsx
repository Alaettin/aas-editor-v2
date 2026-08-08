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
import { Button } from "@/components/ui/button";
import { PRO_SEITE, useProjects } from "@/store/projects";

/**
 * Die Tabelle des Einstiegs samt Blaetterleiste.
 *
 * Auswahl und Oeffnen sind getrennt: ein Klick fuellt das Detailpanel rechts, ein
 * Doppelklick oder der Knopf "Oeffnen" geht in den Editor. Wer die Liste nur durchsieht,
 * soll nicht bei jedem Klick den Editor laden.
 *
 * Seit dem 08.08.2026 in der Erscheinung des Editors: Sortierkoepfe und Blaetterschalter
 * sind `ui/button.tsx`, die Farben kommen aus der Rampe des Editors.
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

const FORMAT_FARBE: Record<string, string> = {
  json: "var(--type-aas)",
  xml: "var(--type-cd)",
  aasx: "var(--type-sm)",
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
          className={`${RASTER} min-w-(--min-w-einstiegstabelle) border-b border-border px-4 py-2`}
        >
          {SPALTEN.map((spalte) => (
            <Button
              key={spalte.feld}
              variant="ghost"
              size="xs"
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
                "min-w-0 font-mono text-3xs tracking-(--tracking-etikett) uppercase " +
                (sort === spalte.feld ? "text-foreground" : "text-mono-foreground") +
                (spalte.rechts ? " justify-end" : " justify-start")
              }
            >
              <span className="truncate">{t(spalte.schluessel)}</span>
              {sort === spalte.feld ? (
                dir === "asc" ? (
                  <ChevronUp aria-hidden />
                ) : (
                  <ChevronDown aria-hidden />
                )
              ) : null}
            </Button>
          ))}
        </div>

        <div className="min-h-0 min-w-(--min-w-einstiegstabelle) flex-1 overflow-y-auto">
          {fehler ? (
            <p role="alert" className="px-4 py-6 text-sm text-destructive">
              {fehler}
            </p>
          ) : null}

          {status === "bereit" && projekte.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-4 py-16 text-center">
              <p className="text-md text-foreground">
                {total === 0 ? t("projekte.leerTitel") : t("projekte.keineTreffer")}
              </p>
              <p className="text-sm text-foreground-faint">
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
                `${RASTER} cursor-pointer border-b border-border-row px-4 py-2.5 transition-colors duration-(--duration-quick) ` +
                (auswahlId === projekt.id
                  ? "bg-selected text-selected-foreground"
                  : "hover:bg-muted")
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
                    background: FORMAT_FARBE[projekt.sourceFormat] ?? "var(--foreground-faint)",
                  }}
                />
                <span className="truncate text-base">{projekt.name}</span>
              </div>
              <span className="truncate text-right font-mono text-2xs text-mono-foreground" data-numeric>
                {projekt.nodeCount}
              </span>
              <span className="truncate text-right font-mono text-2xs text-mono-foreground" data-numeric>
                {projekt.submodelCount}
              </span>
              <span className="truncate text-right font-mono text-2xs text-foreground-faint" data-numeric>
                {datum.format(projekt.updatedAt)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex h-(--h-statusbar) shrink-0 items-center gap-x-5 border-t border-border bg-card px-4">
        <span className="font-mono text-xs text-mono-foreground" data-numeric>
          {t("projekte.bereich", { von, bis, gesamt: total })}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("projekte.seiteErste")}
            disabled={seite <= 1}
            onClick={() => geheZuSeite(1)}
          >
            <ChevronsLeft aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("projekte.seiteZurueck")}
            disabled={seite <= 1}
            onClick={() => geheZuSeite(seite - 1)}
          >
            <ChevronLeft aria-hidden />
          </Button>

          {/*
            Bei vielen Seiten waeren alle Zahlen eine Bleiwueste. Gezeigt wird ein Fenster
            um die aktuelle Seite; die Raender bleiben ueber die Pfeile erreichbar.
          */}
          {seiten
            .filter((nummer) => Math.abs(nummer - seite) <= 2)
            .map((nummer) => (
              <Button
                key={nummer}
                variant={nummer === seite ? "default" : "ghost"}
                size="icon-xs"
                aria-label={t("projekte.seiteNummer", { nummer })}
                aria-current={nummer === seite ? "page" : undefined}
                onClick={() => geheZuSeite(nummer)}
                className="font-mono"
              >
                {nummer}
              </Button>
            ))}

          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("projekte.seiteVor")}
            disabled={seite >= seitenzahl}
            onClick={() => geheZuSeite(seite + 1)}
          >
            <ChevronRight aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("projekte.seiteLetzte")}
            disabled={seite >= seitenzahl}
            onClick={() => geheZuSeite(seitenzahl)}
          >
            <ChevronsRight aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
