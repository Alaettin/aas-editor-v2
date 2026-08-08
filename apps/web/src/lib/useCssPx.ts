import { useEffect, useState } from "react";

/**
 * Liest eine CSS-Variable in Pixeln vom Wurzelelement.
 *
 * Gebraucht fuer die Zeilenhoehe des virtualisierten Baums: sie steht in `tokens.css`.
 * Vorher stand die Zahl zusaetzlich im JavaScript und lief bei jedem Dichtewechsel aus dem
 * Takt.
 *
 * Gelesen wird einmal beim Einhaengen. Bis zum 08.08.2026 horchte hier ein
 * MutationObserver auf `data-density`; seit die Dichte fest auf kompakt steht, aendert sich
 * der Wert zur Laufzeit nicht mehr.
 */
export function useCssPx(name: string, fallback: number): number {
  const [wert, setWert] = useState(fallback);

  useEffect(() => {
    const roh = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const zahl = Number.parseFloat(roh);
    if (Number.isFinite(zahl) && zahl > 0) setWert(zahl);
  }, [name]);

  return wert;
}
