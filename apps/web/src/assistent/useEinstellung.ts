import { useCallback, useEffect, useState } from "react";
import { einstellungApi, type AssistentEinstellung } from "../api/assistent";

/**
 * Laden und Aendern von Schluessel und Modell des Assistenten.
 *
 * Nur der Zustand, kein Aussehen. Die beiden Einstellungsdialoge zeigen dasselbe, sehen
 * aber bewusst verschieden aus (Editor-Rampe gegen Markenflaeche, siehe den Kommentar in
 * `Projects/EinstellungenDialog.tsx`). Geteilt wird deshalb hier, wo es sich lohnt, und
 * nicht in einem Bauteil mit Stil-Parametern.
 */
export function useAssistentEinstellung() {
  const [stand, setStand] = useState<AssistentEinstellung | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  /**
   * Ob das Eingabefeld offensteht. Liegt schon ein Schluessel, ist die Ruhelage eine
   * einzige Zeile mit der Maske; das Feld kommt erst auf Verlangen. Ein Feld, das immer
   * leer dasteht, sieht nach unerledigter Arbeit aus, obwohl alles eingerichtet ist.
   */
  const [aendert, setAendert] = useState(false);
  const [entwurf, setEntwurf] = useState("");

  useEffect(() => {
    let abgemeldet = false;
    void einstellungApi
      .lesen()
      .then((gelesen) => {
        if (!abgemeldet) setStand(gelesen);
      })
      .catch(() => undefined);
    return () => {
      abgemeldet = true;
    };
  }, []);

  const rufe = useCallback(async (auftrag: Promise<AssistentEinstellung>) => {
    setLaeuft(true);
    setFehler(null);
    try {
      setStand(await auftrag);
      return true;
    } catch (ausnahme) {
      const mitText = ausnahme as { text?: string; message?: string };
      setFehler(mitText.text ?? mitText.message ?? String(ausnahme));
      return false;
    } finally {
      setLaeuft(false);
    }
  }, []);

  /** Liegt keiner, steht das Feld sofort da: es gibt nichts zu verbergen. */
  const offen = aendert || (stand !== null && !stand.gesetzt);

  return {
    stand,
    laeuft,
    fehler,
    offen,
    entwurf,
    setEntwurf,
    /** `••••` plus die vier Zeichen vom Server. Ohne erfundenes `sk-` davor. */
    maske: stand?.endung === null || stand?.endung === undefined ? "" : `••••${stand.endung}`,
    beginneAendern: () => {
      setEntwurf("");
      setFehler(null);
      setAendert(true);
    },
    brichAb: () => {
      setEntwurf("");
      setFehler(null);
      setAendert(false);
    },
    speichereSchluessel: async () => {
      const gelungen = await rufe(einstellungApi.setzen({ schluessel: entwurf }));
      if (gelungen) {
        setEntwurf("");
        setAendert(false);
      }
      return gelungen;
    },
    waehleModell: (modell: string) => rufe(einstellungApi.setzen({ modell })),
    entferneSchluessel: () => rufe(einstellungApi.loeschen()),
  };
}
