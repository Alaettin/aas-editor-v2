import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Search } from "lucide-react";

import { useProjects } from "@/store/projects";

/**
 * Der Kopf des Einstiegs: Bereichsangabe, Suche, Knopf fuer ein neues Projekt.
 *
 * Die Suche fuehrt einen eigenen Entwurf und meldet erst nach einer Pause nach oben. Ohne
 * das ginge je Tastendruck eine Anfrage an den Server, und die Liste flackerte.
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
    <header className="flex flex-wrap items-center gap-x-6 gap-y-4 border-b border-axon-linie px-8.5 pt-7.5 pb-5.5">
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-2xs tracking-(--tracking-etikett) text-axon-schrift-still uppercase">
          {t("projekte.arbeitsbereich")}
        </span>
        <h1 className="font-display text-3xl font-light tracking-tight text-axon-schrift">
          {t("projekte.titel")}
        </h1>
      </div>

      <div className="flex min-w-0 flex-1 justify-center">
        <label className="flex h-(--h-einstiegsfeld) w-full max-w-(--w-einstiegssuche) items-center gap-2.5 border border-axon-feld-rand bg-axon-feld px-3.5 transition-colors duration-(--duration-calm) focus-within:border-axon-fokus">
          <Search aria-hidden className="size-4 shrink-0 text-axon-schrift-still" />
          <span className="sr-only">{t("projekte.suche")}</span>
          <input
            type="search"
            value={entwurf}
            onChange={(event) => setEntwurf(event.target.value)}
            placeholder={t("projekte.suche")}
            className="min-w-0 flex-1 bg-transparent text-sm text-axon-schrift outline-none placeholder:text-axon-platzhalter"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={onNeu}
        className="flex h-(--h-einstiegsfeld) shrink-0 items-center gap-2.5 bg-axon-aktion px-5 text-2xs tracking-(--tracking-aktion) text-axon-aktion-schrift uppercase transition-colors duration-(--duration-calm) hover:bg-axon-aktion-hover"
      >
        {t("projekte.neu")}
        <Plus aria-hidden className="size-4" />
      </button>
    </header>
  );
}
