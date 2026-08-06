import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { useEditor, type View } from "@/store/editor";

const SICHTEN: readonly View[] = ["graph", "formular"];

/**
 * Der Graph ist seit dem 06.08.2026 abgeschaltet: er wird ueberarbeitet. Bewusst
 * deaktiviert statt entfernt, damit die Sicht als geplant erkennbar bleibt und der
 * Umschalter nachher nicht neu gebaut werden muss.
 */
const ABGESCHALTET: readonly View[] = ["graph"];

/**
 * Segmentkontrolle statt Reiter: der Baum bleibt in allen drei Sichten links stehen,
 * gewechselt wird nur die rechte Flaeche. Das ist ein Perspektivwechsel, kein Ortswechsel,
 * und ein Segment sagt genau das (Plan Abschnitt 8).
 *
 * `data-view` bleibt erhalten, die Browserabnahme haengt daran.
 */
export function ViewSwitch() {
  const { t } = useTranslation();
  const view = useEditor((state) => state.view);
  const setView = useEditor((state) => state.setView);
  const model = useEditor((state) => state.model);

  return (
    <div
      role="tablist"
      aria-label={t("sicht.titel")}
      className="flex items-center gap-0.5 rounded-xl bg-segment-track p-[3px]"
    >
      {SICHTEN.map((sicht) => {
        const aktiv = view === sicht;
        const abgeschaltet = ABGESCHALTET.includes(sicht);
        return (
          <button
            key={sicht}
            type="button"
            role="tab"
            aria-selected={aktiv}
            data-view={sicht}
            disabled={!model || abgeschaltet}
            title={abgeschaltet ? t("sicht.abgeschaltet") : undefined}
            onClick={() => setView(sicht)}
            className={cn(
              "rounded-md px-3 py-1 text-sm transition-colors duration-(--duration-quick) disabled:opacity-50",
              aktiv
                ? "bg-segment-active font-semibold text-segment-active-foreground shadow-(--shadow-raised)"
                : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`sicht.${sicht}`)}
          </button>
        );
      })}
    </div>
  );
}
