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
import type { TreeRow } from "@/store/rows";

/** Rueckfrage vor dem Loeschen. Rueckgaengig bleibt trotzdem moeglich. */
export function DeleteDialog({
  row,
  onClose,
}: {
  readonly row: TreeRow | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const deleteElement = useEditor((state) => state.deleteElement);

  return (
    <AlertDialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("baum.loeschenTitel", { name: row?.label ?? "" })}</AlertDialogTitle>
          <AlertDialogDescription>{t("baum.loeschenText")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("baum.abbrechen")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (row) deleteElement(row.nodeId);
              onClose();
            }}
          >
            {t("baum.loeschen")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
