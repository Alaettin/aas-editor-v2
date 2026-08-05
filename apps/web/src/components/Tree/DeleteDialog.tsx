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
import { labelOf } from "@/store/rows";

/**
 * Rueckfrage vor dem Loeschen. Rueckgaengig bleibt trotzdem moeglich.
 *
 * Der Knoten kommt aus dem Store, nicht als Prop: geloescht wird aus dem Baum, aus dem
 * Kontextmenue und aus der Menuezeile.
 */
export function DeleteDialog() {
  const { t } = useTranslation();
  const model = useEditor((state) => state.model);
  const nodeId = useEditor((state) => state.pendingDeleteId);
  const requestDelete = useEditor((state) => state.requestDelete);
  const deleteElement = useEditor((state) => state.deleteElement);

  const node = model && nodeId ? model.nodes[nodeId] : undefined;
  const onClose = () => requestDelete(null);

  return (
    <AlertDialog
      open={nodeId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("baum.loeschenTitel", { name: node ? labelOf(node) : "" })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("baum.loeschenText")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("baum.abbrechen")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (nodeId) deleteElement(nodeId);
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
