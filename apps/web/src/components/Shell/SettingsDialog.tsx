import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { useAnsicht } from "@/store/ansicht";
import { AssistentEinstellungAbschnitt } from "./AssistentEinstellung";

/**
 * Einstellungen, bewusst klein: Dichte und Sprache. Alles andere sitzt an seinem Ort in
 * der Werkzeugleiste oder in deren Ueberlaufmenue.
 *
 * Die Erscheinung stand hier bis zum 06.08.2026. Es gibt nur noch eine.
 */
export function SettingsDialog({
  offen,
  onClose,
}: {
  readonly offen: boolean;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const density = useAnsicht((state) => state.density);
  const setDensity = useAnsicht((state) => state.setDensity);

  return (
    <Dialog open={offen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("werkzeug.einstellungen")}</DialogTitle>
          <DialogDescription>{t("einstellungen.text")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <SectionLabel>{t("app.dichte")}</SectionLabel>
          <div className="flex gap-2">
            <Button
              variant={density === "compact" ? "default" : "outline"}
              size="sm"
              onClick={() => setDensity("compact")}
            >
              {t("app.dichteKompakt")}
            </Button>
            <Button
              variant={density === "cozy" ? "default" : "outline"}
              size="sm"
              onClick={() => setDensity("cozy")}
            >
              {t("app.dichteKomfortabel")}
            </Button>
          </div>
        </div>

        {/*
          Keine Sprachwahl mehr: die Befehlspalette (Strg+K) schaltet sie um, die
          Anmeldung und der Einstieg haben ihren eigenen Umschalter. Vier Stellen fuer
          dieselbe Einstellung waren drei zu viel.
        */}
        <AssistentEinstellungAbschnitt />
      </DialogContent>
    </Dialog>
  );
}
