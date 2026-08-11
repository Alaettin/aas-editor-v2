import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";

/**
 * Die beiden Bereiche des Zwischenmenues: Projekte und Repository.
 *
 * Sie stehen dort, wo bis zum 11.08.2026 die Ueberschrift "Projekte" stand. Ein Titel, der
 * nur wiederholt, wo man ohnehin ist, kostet dieselbe Zeile wie eine Navigation, die
 * weiterfuehrt.
 *
 * Eine eigene Datei, damit beide Kopfzeilen dieselbe Zeile tragen, so wie `Titelzeile.tsx`
 * es seit dem 08.08.2026 fuer die oberste Zeile tut. Was rechts daneben steht, gehoert dem
 * jeweiligen Bereich: Suche und "Neu" sind Sache der Projekte, "Uebernehmen" Sache des
 * Repositories.
 *
 * Bewusst `NavLink` und nicht `ui/tabs.tsx`: das sind zwei Routen, keine zwei Ansichten
 * derselben Seite. Ein Tab-Bauteil haette eine Auswahl gefuehrt, die schon in der Adresse
 * steht.
 */

const BEREICHE = [
  { pfad: "/projekte", schluessel: "projekte.titel" },
  { pfad: "/repository", schluessel: "repository.titel" },
] as const;

export function Bereichsreiter() {
  const { t } = useTranslation();

  return (
    <nav aria-label={t("bereiche.bezeichnung")} className="flex items-center gap-1">
      {BEREICHE.map((bereich) => (
        <NavLink
          key={bereich.pfad}
          to={bereich.pfad}
          className={({ isActive }) =>
            "rounded-(--radius-sm) px-2.5 py-1 text-lg transition-colors duration-(--duration-quick) " +
            (isActive
              ? "text-foreground"
              : "text-foreground-faint hover:bg-muted hover:text-secondary-foreground")
          }
        >
          {t(bereich.schluessel)}
        </NavLink>
      ))}
    </nav>
  );
}
