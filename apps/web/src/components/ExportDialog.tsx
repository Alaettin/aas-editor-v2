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
import { useEditor, NO_ATTACHMENTS } from "@/store/editor";

/**
 * Rueckfrage vor dem Export.
 *
 * Der Export wird **nie** blockiert (Plan Abschnitt 6), es wird nur gesagt, was
 * verlorengeht oder unvollstaendig ist. Gibt es nichts zu sagen, erscheint dieser
 * Dialog gar nicht erst.
 */
export function ExportDialog({
  format,
  onClose,
}: {
  readonly format: "json" | "xml" | "aasx" | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const attachments = useEditor((state) => state.meta?.attachments ?? NO_ATTACHMENTS);
  const issues = useEditor((state) => state.issues);
  const exportAs = useEditor((state) => state.exportAs);

  const constraints = issues.filter((issue) => issue.severity === "constraint").length;
  const warnungen = issues.length - constraints;
  const verliertAnhaenge = format !== "aasx" && attachments.length > 0;

  return (
    <AlertDialog
      open={format !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("export.warnungTitel")}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2">
              {verliertAnhaenge ? (
                <span>{t("export.warnungAnhaenge", { count: attachments.length })}</span>
              ) : null}
              {constraints > 0 ? (
                <span>{t("export.warnungConstraints", { count: constraints })}</span>
              ) : null}
              {warnungen > 0 ? (
                <span>{t("export.warnungWarnungen", { count: warnungen })}</span>
              ) : null}
              <span className="text-muted-foreground">{t("export.warnungHinweis")}</span>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("baum.abbrechen")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (format) void exportAs(format);
              onClose();
            }}
          >
            {t("export.trotzdem")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Gibt es ueberhaupt etwas zu warnen? Sonst wird direkt exportiert, ohne Rueckfrage.
 *
 * Datenwarnungen zaehlen mit: eine doppelte `id` macht die Datei zwar nicht
 * metamodell-widrig, aber unbrauchbar fuer jeden, der Identifiables ueber ihre id sucht.
 */
export function needsExportWarning(
  format: "json" | "xml" | "aasx",
  attachmentCount: number,
  constraintCount: number,
  warningCount: number,
): boolean {
  return (format !== "aasx" && attachmentCount > 0) || constraintCount > 0 || warningCount > 0;
}
