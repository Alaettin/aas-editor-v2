import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { canContain, childSlotsOf, findPasteConflicts, type PasteStrategy } from "@aas-editor/core";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/store/editor";

/**
 * Einfuegen aus der Zwischenablage.
 *
 * Ohne Kollision wird sofort eingefuegt, ohne Rueckfrage. Erst wenn eine fachliche `id`
 * bereits vergeben ist, fragt der Dialog: ueberspringen, ersetzen oder neue id
 * (Plan Abschnitt 6). Geprueft wird ausschliesslich die `id`, nie der `idShort`.
 */
export function PasteDialog() {
  const { t } = useTranslation();
  const model = useEditor((state) => state.model);
  const clipboard = useEditor((state) => state.clipboard);
  const pasteInto = useEditor((state) => state.pasteInto);
  const targetId = useEditor((state) => state.pasteTargetId);
  const requestPaste = useEditor((state) => state.requestPaste);
  const onClose = useCallback(() => requestPaste(null), [requestPaste]);

  /** In welchen Slot des Ziels passt das Fragment ueberhaupt? */
  const ziel = useMemo(() => {
    if (!model || !targetId || !clipboard) return null;
    const node = model.nodes[targetId];
    if (!node) return null;

    const slot = childSlotsOf(node.kind)
      .map((entry) => entry.name)
      .find((name) => canContain(node.kind, name, clipboard.kind, node.data));
    if (slot) return { parentId: targetId, slot };

    // Passt es nicht hinein, dann vielleicht daneben, als Geschwister.
    if (node.parent && node.slot) {
      const parent = model.nodes[node.parent];
      if (parent && canContain(parent.kind, node.slot, clipboard.kind, parent.data)) {
        return { parentId: node.parent, slot: node.slot };
      }
    }
    return null;
  }, [model, targetId, clipboard]);

  const konflikte = useMemo(
    () => (model && clipboard ? findPasteConflicts(model, clipboard) : []),
    [model, clipboard],
  );

  // Kein Konflikt und ein gueltiges Ziel: sofort einfuegen, ohne den Nutzer zu fragen.
  // Als Effekt, nicht waehrend des Renderns: das Einfuegen aendert den Store.
  const sofort = targetId !== null && clipboard !== null && ziel !== null && konflikte.length === 0;
  useEffect(() => {
    if (!sofort || !ziel || !clipboard) return;
    pasteInto(ziel.parentId, ziel.slot, clipboard);
    onClose();
  }, [sofort, ziel, clipboard, pasteInto, onClose]);

  const einfuegen = (strategy: PasteStrategy) => {
    if (!ziel || !clipboard) return;
    pasteInto(ziel.parentId, ziel.slot, clipboard, strategy);
    onClose();
  };

  const offen = targetId !== null && clipboard !== null && !sofort;

  return (
    <AlertDialog
      open={offen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {ziel ? t("einfuegen.titel") : t("einfuegen.unmoeglichTitel")}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2">
              {!ziel ? (
                <span>{t("einfuegen.unmoeglichText", { kind: clipboard?.kind ?? "" })}</span>
              ) : (
                <>
                  <span>{t("einfuegen.kollision", { count: konflikte.length })}</span>
                  <ul className="max-h-40 overflow-auto rounded-md border border-border p-2">
                    {konflikte.map((konflikt) => (
                      <li key={konflikt.id} className="font-mono text-2xs">
                        {konflikt.kind} · {konflikt.id}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>{t("baum.abbrechen")}</AlertDialogCancel>
          {ziel ? (
            <>
              <Button variant="outline" onClick={() => einfuegen("ueberspringen")}>
                {t("einfuegen.ueberspringen")}
              </Button>
              <Button variant="outline" onClick={() => einfuegen("ersetzen")}>
                {t("einfuegen.ersetzen")}
              </Button>
              <Button onClick={() => einfuegen("neue-id")}>{t("einfuegen.neueId")}</Button>
            </>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
