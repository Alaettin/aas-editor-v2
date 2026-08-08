import { useTranslation } from "react-i18next";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AssistentEinstellungAbschnitt } from "./AssistentEinstellung";

/**
 * Einstellungen, bewusst klein: nur der Schluessel des Assistenten. Alles andere sitzt an
 * seinem Ort, in der Werkzeugleiste oder in der Kopfleiste des Einstiegs.
 *
 * Die Erscheinung stand hier bis zum 06.08.2026, die Dichte bis zum 08.08.2026. Von beidem
 * gibt es nur noch eine Fassung. Derselbe Dialog dient jetzt auch dem Einstieg; sein
 * Zwilling `Projects/EinstellungenDialog.tsx` ist damit weg.
 */
export function SettingsDialog({
  offen,
  onClose,
}: {
  readonly offen: boolean;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={offen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("werkzeug.einstellungen")}</DialogTitle>
        </DialogHeader>

        {/*
          Keine Sprachwahl mehr: die Befehlspalette (Strg+K) schaltet sie um, die
          Anmeldung und der Einstieg haben ihren eigenen Knopf in der Kopfleiste. Eine
          dritte Stelle fuer dieselbe Einstellung waere eine zu viel.
        */}
        <AssistentEinstellungAbschnitt />
      </DialogContent>
    </Dialog>
  );
}
