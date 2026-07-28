import { useEffect } from "react";
import { useTranslation } from "react-i18next";

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
import { useEditor } from "@/store/editor";

/**
 * Angebot, einen zwischengespeicherten Stand fortzusetzen (Plan Abschnitt 11, Phase 5).
 *
 * Erscheint nur beim Start und nur, wenn nichts geoeffnet ist. Der Hinweis auf die
 * fehlenden Anhaenge steht ausdruecklich drin: sie liegen nicht in IndexedDB, und der
 * Nutzer soll das erfahren, bevor er weiterarbeitet, nicht beim Export.
 */
export function RestoreDialog() {
  const { t } = useTranslation();
  const draft = useEditor((state) => state.draft);
  const checkForDraft = useEditor((state) => state.checkForDraft);
  const restoreDraft = useEditor((state) => state.restoreDraft);
  const discardDraft = useEditor((state) => state.discardDraft);

  useEffect(() => {
    void checkForDraft();
  }, [checkForDraft]);

  return (
    <AlertDialog open={draft !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("entwurf.titel")}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2">
              <span>
                {t("entwurf.text", {
                  datei: draft?.fileName ?? "",
                  zeitpunkt: draft ? new Date(draft.savedAt).toLocaleString("de-DE") : "",
                  count: draft?.nodeCount ?? 0,
                })}
              </span>
              {draft && draft.attachmentPaths.length > 0 ? (
                <span className="text-warning">
                  {t("entwurf.ohneAnhaenge", { count: draft.attachmentPaths.length })}
                </span>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => void discardDraft()}>
            {t("entwurf.verwerfen")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => void restoreDraft()}>
            {t("entwurf.fortsetzen")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
