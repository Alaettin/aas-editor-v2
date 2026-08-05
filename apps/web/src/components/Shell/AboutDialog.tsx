import { useTranslation } from "react-i18next";
import { METAMODEL_VERSION } from "@aas-editor/core";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Kurz und wahr: Fassung, Metamodellstand, Herkunft der Farbwelt. */
export function AboutDialog({
  offen,
  onClose,
}: {
  readonly offen: boolean;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={offen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("app.titel")}</DialogTitle>
          <DialogDescription>{t("hilfe.ueberText")}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t("hilfe.metamodell")}</dt>
          <dd data-numeric>{METAMODEL_VERSION}</dd>
          <dt className="text-muted-foreground">{t("hilfe.farbwelt")}</dt>
          <dd>Neoception AXON</dd>
        </dl>
      </DialogContent>
    </Dialog>
  );
}
