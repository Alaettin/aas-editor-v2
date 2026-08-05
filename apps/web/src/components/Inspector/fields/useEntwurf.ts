import { useEffect, useState, type KeyboardEvent } from "react";

/**
 * Ein Textfeld, das waehrend des Tippens fuer sich bleibt und erst beim Verlassen meldet.
 *
 * Plan Abschnitt 10 gibt vor: der Tastendruck steht in unter 50 ms als Zeichen im Feld.
 * Meldet ein Feld dagegen bei jedem Zeichen nach oben, laeuft je Tastendruck der ganze
 * Aenderungsweg: Immer-Patch, Nachricht an den Worker, Neuaufbau der Baumzeilen, des
 * Zensus und der Befundzaehler. Gemessen waren das bei zehntausend Elementen 87 ms.
 *
 * `TextEditor` hat dieses Muster von Anfang an getragen, die uebrigen Feldarten nicht.
 * Statt es viermal nachzubauen, steht es hier einmal.
 *
 * Der Wert von aussen gewinnt immer: Rueckgaengig, ein Auswahlwechsel oder ein geladener
 * Stand ueberschreiben den Entwurf.
 */
export interface Entwurf {
  readonly wert: string;
  readonly setzen: (wert: string) => void;
  /** Beim Verlassen des Feldes: melden, wenn sich wirklich etwas geaendert hat. */
  readonly abgeben: () => void;
  /** Enter gibt ab, Escape verwirft. */
  readonly aufTaste: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

export function useEntwurf(aktuell: string, melden: (wert: string) => void): Entwurf {
  const [wert, setzen] = useState(aktuell);

  useEffect(() => setzen(aktuell), [aktuell]);

  const abgeben = () => {
    if (wert !== aktuell) melden(wert);
  };

  return {
    wert,
    setzen,
    abgeben,
    aufTaste: (event) => {
      if (event.key === "Enter") event.currentTarget.blur();
      // Kein blur() beim Verwerfen: der Rueckruf beim Verlassen liest den Entwurf, und
      // der steht in diesem Augenblick noch auf dem verworfenen Text.
      if (event.key === "Escape") setzen(aktuell);
    },
  };
}
