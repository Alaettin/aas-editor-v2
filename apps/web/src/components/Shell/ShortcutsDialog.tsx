import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KbdHint } from "@/components/ui/kbd";
import { SectionLabel } from "@/components/ui/section-label";
import { BEREICHE, TASTENWEGE } from "@/lib/shortcuts";

/**
 * Tastaturwege, an einer Stelle nachlesbar.
 *
 * Die Liste kommt aus `lib/shortcuts.ts` und wird nicht mehr hier gepflegt: sie stand
 * frueher fuenffach im Code und war bereits auseinandergelaufen.
 */

export function ShortcutsDialog({
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
          <DialogTitle>{t("hilfe.tastaturwege")}</DialogTitle>
          <DialogDescription>{t("hilfe.tastaturwegeText")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {BEREICHE.map((gruppe) => (
            <div key={gruppe.bereich} className="flex flex-col gap-2">
              <SectionLabel>{t(gruppe.titel)}</SectionLabel>
              {TASTENWEGE.filter((weg) => weg.bereich === gruppe.bereich).map((weg) => (
                <div key={weg.wirkung} className="flex items-baseline gap-3 text-sm">
                  <KbdHint className="shrink-0">{weg.tasten}</KbdHint>
                  <span className="text-muted-foreground">{t(weg.wirkung)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
