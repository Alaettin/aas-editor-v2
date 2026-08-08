import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useProjects } from "@/store/projects";

/**
 * Die Rueckfrage vor dem Loeschen.
 *
 * `AlertDialog` und nicht `Dialog`: das Loeschen ist endgueltig, und die Rolle
 * `alertdialog` sagt einem Screenreader genau das. Der Abbruch ist die Vorgabe.
 *
 * Seit dem 08.08.2026 derselbe Bauteil wie im Editor, nicht mehr die eigene Markenfassung.
 */
export function DeleteProjectDialog({
  projekt,
  onClose,
}: {
  readonly projekt: { id: string; name: string } | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const loeschen = useProjects((state) => state.loeschen);
  const loeschtId = useProjects((state) => state.loeschtId);
  const laeuft = loeschtId !== null;

  return (
    <AlertDialog open={projekt !== null} onOpenChange={(offen) => !offen && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("projekte.loeschenTitel")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("projekte.loeschenText", { name: projekt?.name ?? "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={laeuft}>{t("projekte.abbrechen")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={laeuft}
            onClick={(event) => {
              // Die Rueckfrage bleibt offen, bis der Server geantwortet hat: sonst
              // verschwindet sie, und ein Fehlschlag hat nirgends mehr einen Ort.
              event.preventDefault();
              if (!projekt) return;
              void loeschen(projekt.id).then((geklappt) => {
                if (geklappt) onClose();
              });
            }}
          >
            {laeuft ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {t("projekte.loeschen")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
