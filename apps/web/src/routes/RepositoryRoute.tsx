import { useEffect, useState } from "react";

import { Detailleiste } from "@/components/Repository/Detailleiste";
import { Kopfzeile } from "@/components/Repository/Kopfzeile";
import { Teilmodellliste } from "@/components/Repository/Teilmodellliste";
import { UebernehmenDialog } from "@/components/Repository/UebernehmenDialog";
import { SettingsDialog } from "@/components/Shell/SettingsDialog";
import { Titelzeile } from "@/components/Shell/Titelzeile";
import { useRepository } from "@/store/repository";

/**
 * Das Submodel Repository, der zweite Bereich des Zwischenmenues.
 *
 * Derselbe Rahmen wie `ProjectsRoute`: Titelzeile, Arbeitszeile mit dem Bereichsreiter,
 * darunter Liste und Detail. Und dieselbe Auflage: **kein Import aus store/editor**, dieser
 * Bildschirm gehoert ins Nachladebuendel neben der Projektliste, nicht in den Editor.
 */
export function RepositoryRoute() {
  const laden = useRepository((state) => state.laden);

  const [uebernehmenOffen, setUebernehmenOffen] = useState(false);
  const [einstellungenOffen, setEinstellungenOffen] = useState(false);

  useEffect(() => {
    void laden();
  }, [laden]);

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-background">
      <Titelzeile onEinstellungen={() => setEinstellungenOffen(true)} />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <Kopfzeile onUebernehmen={() => setUebernehmenOffen(true)} />
          <Teilmodellliste onUebernehmen={() => setUebernehmenOffen(true)} />
        </div>

        <Detailleiste />
      </div>

      <UebernehmenDialog offen={uebernehmenOffen} onClose={() => setUebernehmenOffen(false)} />
      <SettingsDialog offen={einstellungenOffen} onClose={() => setEinstellungenOffen(false)} />
    </main>
  );
}
