import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SectionLabel } from "@/components/ui/section-label";
import type { AasFormat } from "@aas-editor/core/io";

/**
 * Die Formatwahl vor dem Export.
 *
 * Bis zum 06.08.2026 hing sie in einem Untermenue der Menuezeile, und der Knopf in der
 * Werkzeugleiste schrieb kommentarlos AASX. Seit die Menuezeile weg ist, fragt der Knopf.
 *
 * Dahinter bleibt `ExportDialog`: der warnt, wenn etwas verlorengeht, und blockiert nie.
 * Zwei Fenster hintereinander sind hier richtig, sie beantworten zwei Fragen -- welches
 * Format, und ist der Verlust in Ordnung.
 */

const ZIELE: readonly { format: AasFormat; titel: string; text: string }[] = [
  { format: "aasx", titel: "export.aasx", text: "export.aasxText" },
  { format: "json", titel: "export.json", text: "export.jsonText" },
  { format: "xml", titel: "export.xml", text: "export.xmlText" },
];

export function ExportFormatDialog({
  offen,
  onClose,
  onWahl,
}: {
  readonly offen: boolean;
  readonly onClose: () => void;
  readonly onWahl: (format: AasFormat) => void;
}) {
  const { t } = useTranslation();
  const [ziel, setZiel] = useState<AasFormat>("aasx");

  return (
    <Dialog open={offen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("export.formatTitel")}</DialogTitle>
          <DialogDescription>{t("export.formatText")}</DialogDescription>
        </DialogHeader>

        <div role="radiogroup" aria-label={t("export.formatTitel")} className="flex flex-col">
          {ZIELE.map((eintrag) => (
            <button
              key={eintrag.format}
              type="button"
              role="radio"
              aria-checked={ziel === eintrag.format}
              onClick={() => setZiel(eintrag.format)}
              className={
                "flex items-start gap-3 border-b border-border-subtle px-1 py-3 text-left transition-colors duration-(--duration-quick) " +
                (ziel === eintrag.format
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              <span
                aria-hidden
                className={
                  "mt-1 size-2.5 shrink-0 rounded-full border " +
                  (ziel === eintrag.format ? "border-ring bg-ring" : "border-input")
                }
              />
              <span className="flex flex-col gap-0.5">
                <SectionLabel>{t(eintrag.titel)}</SectionLabel>
                <span className="text-2xs text-muted-foreground">{t(eintrag.text)}</span>
              </span>
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("baum.abbrechen")}
          </Button>
          <Button
            onClick={() => {
              onWahl(ziel);
              onClose();
            }}
          >
            {t("app.exportieren")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
