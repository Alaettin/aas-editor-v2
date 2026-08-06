import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { Datenband } from "@/components/Projects/Datenband";
import { DeleteProjectDialog } from "@/components/Projects/DeleteProjectDialog";
import { Detailleiste } from "@/components/Projects/Detailleiste";
import { EinstellungenDialog } from "@/components/Projects/EinstellungenDialog";
import { ExportProjectDialog } from "@/components/Projects/ExportProjectDialog";
import { Kopfzeile } from "@/components/Projects/Kopfzeile";
import { NewProjectDialog } from "@/components/Projects/NewProjectDialog";
import { Projektliste } from "@/components/Projects/Projektliste";
import { Seitenleiste } from "@/components/Projects/Seitenleiste";
import { useProjects } from "@/store/projects";

/**
 * Einstiegspunkt nach der Anmeldung.
 *
 * Kein Import aus store/editor: dieser Bildschirm liegt im Startbundle, der Editor wird
 * erst beim Oeffnen eines Projekts geladen. Auch der Export der Liste haelt sich daran, er
 * laedt den Kern ueber einen dynamischen Import (siehe `lib/projektExport.ts`).
 *
 * Die Route traegt `szene-axon` wie die Anmeldung. Damit ist sie eine Markenflaeche und
 * folgt bewusst **nicht** der hellen oder dunklen Erscheinung des Editors: zwischen
 * Anmeldung und Einstieg soll kein Bruch stehen.
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
    <main
      className="szene-axon relative flex h-screen overflow-hidden"
      style={{ background: "var(--axon-buehne)" }}
    >
      <Datenband />

      <Seitenleiste onEinstellungen={() => setEinstellungenOffen(true)} />

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Kopfzeile onNeu={() => setNeuOffen(true)} />
        <Projektliste />
      </div>

      <Detailleiste onExport={setZuExportieren} onLoeschen={setZuLoeschen} />

      <NewProjectDialog
        offen={neuOffen}
        onClose={() => setNeuOffen(false)}
        onAngelegt={(id) => void navigate(`/editor/${id}`)}
      />
      <ExportProjectDialog projekt={zuExportieren} onClose={() => setZuExportieren(null)} />
      <DeleteProjectDialog projekt={zuLoeschen} onClose={() => setZuLoeschen(null)} />
      <EinstellungenDialog
        offen={einstellungenOffen}
        onClose={() => setEinstellungenOffen(false)}
      />
    </main>
  );
}
