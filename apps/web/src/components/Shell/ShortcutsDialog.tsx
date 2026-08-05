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

/**
 * Tastaturwege, an einer Stelle nachlesbar. Die Liste ist von Hand gepflegt und muss mit
 * den Bindungen in Tree.tsx, AppShell.tsx und CommandPalette.tsx uebereinstimmen.
 */

const GRUPPEN: readonly { titel: string; wege: readonly [string, string][] }[] = [
  {
    titel: "hilfe.gruppeAllgemein",
    wege: [
      ["Strg+K", "hilfe.palette"],
      ["Strg+J", "hilfe.assistent"],
      ["Strg+S", "hilfe.speichern"],
      ["Strg+Z", "hilfe.rueckgaengig"],
      ["Strg+Y", "hilfe.wiederholen"],
    ],
  },
  {
    titel: "hilfe.gruppeBaum",
    wege: [
      ["Hoch, Runter", "hilfe.bewegen"],
      ["Rechts", "hilfe.aufklappen"],
      ["Links", "hilfe.zuklappen"],
      ["Pos1, Ende", "hilfe.anfangEnde"],
      ["Entf", "hilfe.loeschen"],
      ["Strg+D", "hilfe.duplizieren"],
      ["Strg+C, Strg+X, Strg+V", "hilfe.zwischenablage"],
      ["F2, Enter", "hilfe.idShort"],
    ],
  },
];

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
          {GRUPPEN.map((gruppe) => (
            <div key={gruppe.titel} className="flex flex-col gap-2">
              <SectionLabel>{t(gruppe.titel)}</SectionLabel>
              {gruppe.wege.map(([taste, beschreibung]) => (
                <div key={taste} className="flex items-baseline gap-3 text-sm">
                  <KbdHint className="shrink-0">{taste}</KbdHint>
                  <span className="text-muted-foreground">{t(beschreibung)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
