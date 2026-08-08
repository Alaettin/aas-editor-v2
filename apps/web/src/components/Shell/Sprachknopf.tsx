import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAnsicht } from "@/store/ansicht";

/**
 * Ein Knopf, der die **aktive** Sprache zeigt und auf die andere umschaltet.
 *
 * Bis zum 08.08.2026 stand hier eine Zeile "DE / EN", bei der die gewaehlte Sprache nur an
 * einer Nuance der Schriftfarbe zu erkennen war. Jetzt steht genau ein Kuerzel da, und das
 * ist das geltende; wohin der Klick fuehrt, sagt der Tooltip.
 *
 * Gemeinsames Bauteil fuer die Anmeldung und die Kopfleiste des Einstiegs. Im Editor bleibt
 * die Befehlspalette der Weg, dort ist die Werkzeugleiste voll.
 */
export function Sprachknopf() {
  const { t } = useTranslation();
  const language = useAnsicht((state) => state.language);
  const setLanguage = useAnsicht((state) => state.setLanguage);

  const ziel = language === "de" ? "en" : "de";
  const zielName = ziel === "de" ? t("app.deutsch") : t("app.englisch");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("app.spracheWechseln", { sprache: zielName })}
          onClick={() => setLanguage(ziel)}
        >
          <Globe data-icon="inline-start" />
          <span className="font-mono">{language.toUpperCase()}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("app.spracheWechseln", { sprache: zielName })}</TooltipContent>
    </Tooltip>
  );
}
