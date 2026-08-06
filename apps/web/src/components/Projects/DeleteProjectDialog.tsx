import { useTranslation } from "react-i18next";
import { AlertDialog } from "radix-ui";
import { Loader2 } from "lucide-react";

import { useProjects } from "@/store/projects";
import { ABBRECHEN, aktionsKnopf, INHALT, TEXT, TITEL, UEBERLAGERUNG } from "./markenDialog";

/**
 * Die Rueckfrage vor dem Loeschen, im Stil der Seite.
 *
 * `AlertDialog` und nicht `Dialog`: das Loeschen ist endgueltig, und die Rolle
 * `alertdialog` sagt einem Screenreader genau das. Der Abbruch ist die Vorgabe.
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
    <AlertDialog.Root open={projekt !== null} onOpenChange={(offen) => !offen && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={UEBERLAGERUNG} />
        <AlertDialog.Content className={INHALT}>
          <AlertDialog.Title className={TITEL}>{t("projekte.loeschenTitel")}</AlertDialog.Title>
          <AlertDialog.Description className={TEXT}>
            {t("projekte.loeschenText", { name: projekt?.name ?? "" })}
          </AlertDialog.Description>

          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel disabled={laeuft} className={ABBRECHEN}>
              {t("projekte.abbrechen")}
            </AlertDialog.Cancel>
            <AlertDialog.Action
              disabled={laeuft}
              className={aktionsKnopf("zerstoerend")}
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
              {laeuft ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : null}
              {t("projekte.loeschen")}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
