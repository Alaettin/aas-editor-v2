import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

import { Bereichsreiter } from "@/components/Shell/Bereichsreiter";
import { Button } from "@/components/ui/button";
import { useRepository } from "@/store/repository";

/**
 * Die Arbeitszeile des Repositories. Derselbe Reiter wie bei den Projekten, rechts die
 * eigene Aktion.
 *
 * Kein Suchfeld: das Repository fasst die Teilmodelle, die jemand ausdruecklich ausgewaehlt
 * hat, und das sind Dutzende, keine Tausende. Ein Feld, das nie etwas findet, was nicht
 * ohnehin auf dem Bildschirm steht, ist kein Werkzeug.
 */
export function Kopfzeile({ onUebernehmen }: { readonly onUebernehmen: () => void }) {
  const { t } = useTranslation();
  const info = useRepository((state) => state.info);

  return (
    <div className="flex h-(--h-toolbar) shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <Bereichsreiter />

      {/* Ohne gestartetes Repository gibt es nichts zu uebernehmen, und der Knopf dafuer
          steht dann im leeren Zustand in der Mitte, wo er allein ist. */}
      {info === null ? null : (
        <Button className="ml-auto" onClick={onUebernehmen}>
          <Plus data-icon="inline-start" />
          {t("repository.uebernehmen")}
        </Button>
      )}
    </div>
  );
}
