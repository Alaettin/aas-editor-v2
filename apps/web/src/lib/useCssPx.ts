import { useEffect, useState } from "react";

/**
 * Liest eine CSS-Variable in Pixeln vom Wurzelelement.
 *
 * Gebraucht fuer die Zeilenhoehe des virtualisierten Baums: sie steht in `tokens.css` und
 * haengt an der Dichte. Vorher stand die Zahl zusaetzlich im JavaScript und lief bei jedem
 * Dichtewechsel aus dem Takt.
 */
export function useCssPx(name: string, fallback: number): number {
  const [wert, setWert] = useState(fallback);

  useEffect(() => {
    const lesen = () => {
      const roh = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      const zahl = Number.parseFloat(roh);
      if (Number.isFinite(zahl) && zahl > 0) setWert(zahl);
    };

    lesen();
    // Die Dichte wird ueber ein data-Attribut am Wurzelelement umgeschaltet.
    const beobachter = new MutationObserver(lesen);
    beobachter.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-density", "class"],
    });
    return () => beobachter.disconnect();
  }, [name]);

  return wert;
}
