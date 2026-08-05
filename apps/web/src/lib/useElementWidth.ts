import { useEffect, useState, type RefObject } from "react";

/**
 * Breite eines Elements, beobachtet.
 *
 * Gebraucht in der Tabelle: die Spaltenzahl haengt vom Platz ab, und weil die Spalten als
 * Grid-Spuren gezaehlt werden, muss dieselbe Entscheidung in JavaScript fallen wie in der
 * Darstellung. Eine reine CSS-Container-Query wuerde die Spuren nicht mitzaehlen.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [breite, setBreite] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const beobachter = new ResizeObserver(([eintrag]) => {
      if (eintrag) setBreite(eintrag.contentRect.width);
    });
    beobachter.observe(element);
    setBreite(element.getBoundingClientRect().width);
    return () => beobachter.disconnect();
  }, [ref]);

  return breite;
}
