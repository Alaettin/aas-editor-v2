import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { DeleteProjectDialog } from "@/components/Projects/DeleteProjectDialog";
import { Detailleiste } from "@/components/Projects/Detailleiste";
import { ExportProjectDialog } from "@/components/Projects/ExportProjectDialog";
import { Kopfzeile } from "@/components/Projects/Kopfzeile";
import { NewProjectDialog } from "@/components/Projects/NewProjectDialog";
import { Projektliste } from "@/components/Projects/Projektliste";
import { SettingsDialog } from "@/components/Shell/SettingsDialog";
import { Titelzeile } from "@/components/Shell/Titelzeile";
import { useProjects } from "@/store/projects";

/**
 * Einstiegspunkt nach der Anmeldung.
 *
 * Kein Import aus store/editor: dieser Bildschirm liegt im Startbundle, der Editor wird
 * erst beim Oeffnen eines Projekts geladen. Auch der Export der Liste haelt sich daran, er
 * laedt den Kern ueber einen dynamischen Import (siehe `lib/projektExport.ts`).
 *
 * Bis zum 08.08.2026 war die Route eine eigene Markenflaeche (`szene-axon`) mit linker
 * Leiste, eigenen Knoepfen und eigenen Dialogen. Sie traegt jetzt denselben Rahmen wie der
 * Editor: Kopfleiste mit Marke und Konto, darunter die Arbeitszeile, dann Liste und Detail.
 * Auch der Einstellungsdialog ist derselbe.
 */
export function ProjectsRoute() {
  const navigate = useNavigate();
  const laden = useProjects((state) => state.laden);

  const [neuOffen, setNeuOffen] = useState(false);
  const [einstellungenOffen, setEinstellungenOffen] = useState(false);
  const [zuLoeschen, setZuLoeschen] = useState<{ id: string; name: string } | null>(null);
  const [zuExportieren, setZuExportieren] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    void laden();
  }, [laden]);

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-background">
      <Titelzeile onEinstellungen={() => setEinstellungenOffen(true)} />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <Kopfzeile onNeu={() => setNeuOffen(true)} />
          <Projektliste />
        </div>

        <Detailleiste onExport={setZuExportieren} onLoeschen={setZuLoeschen} />
      </div>

      <NewProjectDialog
        offen={neuOffen}
        onClose={() => setNeuOffen(false)}
        onAngelegt={(id) => void navigate(`/editor/${id}`)}
      />
      <ExportProjectDialog projekt={zuExportieren} onClose={() => setZuExportieren(null)} />
      <DeleteProjectDialog projekt={zuLoeschen} onClose={() => setZuLoeschen(null)} />
      <SettingsDialog offen={einstellungenOffen} onClose={() => setEinstellungenOffen(false)} />
    </main>
  );
}
