import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Search } from "lucide-react";

import { Bereichsreiter } from "@/components/Shell/Bereichsreiter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjects } from "@/store/projects";

/**
 * Die Arbeitszeile des Einstiegs: Bereichsreiter, Suche, Knopf fuer ein neues Projekt.
 *
 * Seit dem 11.08.2026 steht links der Reiter statt der Ueberschrift "Projekte". Suche und
 * "Neu" bleiben hier: sie gehoeren zu den Projekten und nicht zum Repository, das den
 * Reiter zwar teilt, aber seine eigene Aktion daneben stellt.
 *
 * Die Suche fuehrt einen eigenen Entwurf und meldet erst nach einer Pause nach oben. Ohne
 * das ginge je Tastendruck eine Anfrage an den Server, und die Liste flackerte.
 *
 * Seit dem 08.08.2026 mit den Bauteilen des Editors: `ui/input.tsx` und `ui/button.tsx`
 * statt eigener Felder und Knoepfe.
 */

const PAUSE = 250;

export function Kopfzeile({ onNeu }: { readonly onNeu: () => void }) {
  const { t } = useTranslation();
  const suche = useProjects((state) => state.filter.suche);
  const setzeSuche = useProjects((state) => state.setzeSuche);

  const [entwurf, setEntwurf] = useState(suche);

  useEffect(() => {
    if (entwurf === suche) return;
    const kennung = setTimeout(() => setzeSuche(entwurf), PAUSE);
    return () => clearTimeout(kennung);
  }, [entwurf, suche, setzeSuche]);

  return (
    <div className="flex h-(--h-toolbar) shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <Bereichsreiter />

      <div className="relative ml-auto w-full max-w-(--w-einstiegssuche)">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-foreground-faint"
        />
        <Input
          type="search"
          value={entwurf}
          onChange={(event) => setEntwurf(event.target.value)}
          placeholder={t("projekte.suche")}
          aria-label={t("projekte.suche")}
          className="pl-8"
        />
      </div>

      <Button onClick={onNeu}>
        <Plus data-icon="inline-start" />
        {t("projekte.neu")}
      </Button>
    </div>
  );
}
