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
import { meldeErfolg } from "@/lib/melden";
import { useEditor } from "@/store/editor";
import { labelOf } from "@/store/rows";

/**
 * Rueckfrage vor dem Loeschen. Rueckgaengig bleibt trotzdem moeglich.
 *
 * Die Knoten kommen aus dem Store, nicht als Prop: geloescht wird aus dem Baum, aus dem
 * Kontextmenue, aus der Menuezeile, aus dem Formular und aus der Markierung der Tabelle.
 * Die Tabelle loeschte ihre Markierung frueher ohne Rueckfrage; jetzt fuehrt jeder dieser
 * Wege durch denselben Dialog.
 */
export function DeleteDialog() {
  const { t } = useTranslation();
  const model = useEditor((state) => state.model);
  const nodeIds = useEditor((state) => state.pendingDelete);
  const requestDelete = useEditor((state) => state.requestDelete);
  const deleteElement = useEditor((state) => state.deleteElement);

  const einzeln = nodeIds.length === 1 ? model?.nodes[nodeIds[0]!] : undefined;
  const onClose = () => requestDelete([]);

  return (
    <AlertDialog
      open={nodeIds.length > 0}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {einzeln
              ? t("baum.loeschenTitel", { name: labelOf(einzeln) })
              : t("baum.loeschenTitelMehrere", { count: nodeIds.length })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("baum.loeschenText")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("baum.abbrechen")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              for (const nodeId of nodeIds) deleteElement(nodeId);
              if (nodeIds.length === 1) meldeErfolg("melden.geloescht");
              else meldeErfolg("melden.mehrereGeloescht", { count: nodeIds.length });
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
