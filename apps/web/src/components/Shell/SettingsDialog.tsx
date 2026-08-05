import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { useEditor } from "@/store/editor";

/**
 * Einstellungen, bewusst klein: Erscheinung und Dichte. Alles andere gehoert in die
 * Menuezeile, wo es im Zusammenhang steht.
 */
export function SettingsDialog({
  offen,
  onClose,
}: {
  readonly offen: boolean;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const theme = useEditor((state) => state.theme);
  const density = useEditor((state) => state.density);
  const setTheme = useEditor((state) => state.setTheme);
  const setDensity = useEditor((state) => state.setDensity);

  return (
    <Dialog open={offen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("werkzeug.einstellungen")}</DialogTitle>
          <DialogDescription>{t("einstellungen.text")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <SectionLabel>{t("app.erscheinung")}</SectionLabel>
          <div className="flex gap-2">
            <Button
              variant={theme === "light" ? "default" : "outline"}
              size="sm"
              onClick={() => setTheme("light")}
            >
              {t("app.hell")}
            </Button>
            <Button
              variant={theme === "dark" ? "default" : "outline"}
              size="sm"
              onClick={() => setTheme("dark")}
            >
              {t("app.dunkel")}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <SectionLabel>{t("app.dichte")}</SectionLabel>
          <div className="flex gap-2">
            <Button
              variant={density === "compact" ? "default" : "outline"}
              size="sm"
              onClick={() => setDensity("compact")}
            >
              {t("app.dichteKompakt")}
            </Button>
            <Button
              variant={density === "cozy" ? "default" : "outline"}
              size="sm"
              onClick={() => setDensity("cozy")}
            >
              {t("app.dichteKomfortabel")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
