import { useTranslation } from "react-i18next";

import logo from "@/assets/axon-editor-weiss.png";
import { cn } from "@/lib/utils";

/**
 * Die Marke: ein Bild, das Zeichen, Wortmarke und Produktnamen schon enthaelt.
 *
 * Bis zum 08.08.2026 stand hier das Neoception-Logo und daneben "AXON Editor" als Text,
 * nach dem Vorbild des Hubs. Die Vorlage vom 08.08. bringt beides in einem Stueck, also
 * setzt dieses Bauteil nur noch das Bild.
 *
 * Die weisse Fassung entsteht aus der schwarzen Vorlage ueber
 * `scripts/make-logo-weiss.mjs`; auf dem dunklen Blau waere der Schriftzug sonst zur
 * Haelfte unsichtbar. Tuerkis und Violett der Vorlage bleiben dabei erhalten.
 */

interface Props {
  /** `gross` fuer die Anmeldung, `klein` fuer die Titelzeile. */
  readonly groesse?: "gross" | "klein";
  readonly className?: string;
}

export function Marke({ groesse = "klein", className }: Props) {
  const { t } = useTranslation();

  return (
    <img
      src={logo}
      alt={t("app.titel")}
      className={cn(
        "block h-auto select-none",
        groesse === "gross" ? "w-(--w-anmeldelogo)" : "w-(--w-kopflogo)",
        className,
      )}
    />
  );
}
