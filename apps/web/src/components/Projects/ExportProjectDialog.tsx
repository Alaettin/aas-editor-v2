import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

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
import { meldeErfolg, meldeFehler } from "@/lib/melden";
import { biete, EXPORTZIELE, exportiereProjekt, type Exportziel } from "@/lib/projektExport";

/**
 * Die Wahl des Zielformats, bevor exportiert wird.
 *
 * Anders als im Editor wird hier **vor** dem Export gefragt und nicht danach gewarnt: aus
 * der Liste heraus gibt es kein Menue mit drei Eintraegen, es gibt einen Knopf.
 *
 * Der Kern kommt erst beim Bestaetigen herein (dynamischer Import in `projektExport.ts`).
 * Solange der Dialog nur offen steht, ist nichts nachgeladen.
 */

const SCHLUESSEL: Record<Exportziel, { titel: string; text: string }> = {
  "aasx-json": { titel: "projekte.exportAasxJson", text: "projekte.exportAasxJsonText" },
  json: { titel: "projekte.exportJson", text: "projekte.exportJsonText" },
  xml: { titel: "projekte.exportXml", text: "projekte.exportXmlText" },
};

export function ExportProjectDialog({
  projekt,
  onClose,
}: {
  readonly projekt: { id: string; name: string } | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const [ziel, setZiel] = useState<Exportziel>("aasx-json");
  const [laeuft, setLaeuft] = useState(false);

  const absenden = async () => {
    if (!projekt) return;
    setLaeuft(true);
    try {
      const ergebnis = await exportiereProjekt(projekt.id, projekt.name, ziel);
      biete(ergebnis);
      meldeErfolg("melden.exportiert", { name: ergebnis.dateiname });
      onClose();
    } catch (fehler) {
      // Der Dialog bleibt stehen: ein Fehlschlag braucht einen Ort, und die getroffene
      // Wahl soll nicht verloren sein.
      meldeFehler(fehler, "fehler.export");
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Dialog
      open={projekt !== null}
      onOpenChange={(offen) => {
        if (!offen && !laeuft) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("projekte.exportTitel")}</DialogTitle>
          <DialogDescription>
            {t("projekte.exportText", { name: projekt?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>

        <div role="radiogroup" aria-label={t("projekte.exportTitel")} className="flex flex-col">
          {EXPORTZIELE.map((wahl) => (
            <button
              key={wahl}
              type="button"
              role="radio"
              aria-checked={ziel === wahl}
              onClick={() => setZiel(wahl)}
              className={
                "flex items-start gap-3 border-b border-border-subtle px-1 py-3 text-left transition-colors duration-(--duration-quick) " +
                (ziel === wahl ? "text-foreground" : "text-muted-foreground hover:text-foreground")
              }
            >
              <span
                aria-hidden
                className={
                  "mt-1 size-2.5 shrink-0 rounded-full border " +
                  (ziel === wahl ? "border-ring bg-ring" : "border-input")
                }
              />
              <span className="flex flex-col gap-0.5">
                <SectionLabel>{t(SCHLUESSEL[wahl].titel)}</SectionLabel>
                <span className="text-2xs text-muted-foreground">{t(SCHLUESSEL[wahl].text)}</span>
              </span>
            </button>
          ))}
        </div>

        {/*
          Kein zusaetzlicher Warnsatz unter der Liste: was ein Format kann und was es
          verliert, steht schon bei ihm selbst. Ein Hinweis, der dasselbe noch einmal
          sagt, wird nicht gelesen.
        */}
        <DialogFooter>
          <Button variant="ghost" disabled={laeuft} onClick={onClose}>
            {t("projekte.abbrechen")}
          </Button>
          <Button disabled={laeuft} onClick={() => void absenden()}>
            {laeuft ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {laeuft ? t("projekte.exportLaeuft") : t("projekte.exportieren")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
