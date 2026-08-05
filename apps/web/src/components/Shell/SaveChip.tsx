import { useTranslation } from "react-i18next";

import { Chip } from "@/components/ui/chip";
import { useEditor } from "@/store/editor";

/**
 * Speicherzustand neben dem Dateinamen. Gruen heisst wirklich gespeichert, alles andere
 * traegt Warnfarbe: ein ungespeicherter Stand soll auffallen, nicht beruhigen.
 */
export function SaveChip() {
  const { t } = useTranslation();
  const serverStatus = useEditor((state) => state.serverStatus);
  const dirty = useEditor((state) => state.dirty);
  const model = useEditor((state) => state.model);

  if (!model) return null;

  const gespeichert = serverStatus === "gespeichert" && !dirty;
  return (
    // Ob die Arbeit gesichert ist, gehoert zu den Aussagen, die ein Bildschirmleser
    // mitbekommen muss, ohne dass jemand danach sucht.
    <Chip tone={gespeichert ? "sm" : "warn"} size="sm" aria-live="polite">
      {gespeichert ? t("status.gespeichert") : t("status.ungespeichert")}
    </Chip>
  );
}
