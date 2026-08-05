import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";

import { AppShell } from "@/components/AppShell";
import { useEditor } from "@/store/editor";
import { holeDatei } from "@/store/pendingFile";

/**
 * Der Editor selbst. Diese Datei ist die Grenze, ab der das schwere Gepaeck geladen wird:
 * AppShell, Baum, Formular, Immer, der Editor-Store und der Worker.
 *
 * Zwei Wege hierher: mit Projektkennung (Serverstand laden) oder ohne, dann liegt eine
 * abgelegte Datei bereit, die zu einem neuen Projekt wird.
 */
export function EditorRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const ladeProjekt = useEditor((state) => state.ladeProjekt);
  const openFile = useEditor((state) => state.openFile);
  const alsNeuesProjektSpeichern = useEditor((state) => state.alsNeuesProjektSpeichern);

  useEffect(() => {
    if (id !== undefined) {
      void ladeProjekt(id);
      return;
    }

    const abgelegt = holeDatei();
    if (!abgelegt) return;

    void (async () => {
      await openFile(abgelegt.file);
      const neueId = await alsNeuesProjektSpeichern(abgelegt.name);
      // replace, damit der Zurueckknopf nicht auf eine Route ohne Datei fuehrt.
      if (neueId !== null) void navigate(`/editor/${neueId}`, { replace: true });
    })();
  }, [id, ladeProjekt, openFile, alsNeuesProjektSpeichern, navigate]);

  return <AppShell />;
}
