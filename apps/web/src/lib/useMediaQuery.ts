import { useEffect, useState } from "react";

/**
 * Eine Medienabfrage als Zustand.
 *
 * Gebraucht fuer zwei Dinge, die CSS allein nicht loest: die Animation der Anmeldebuehne
 * muss bei `prefers-reduced-motion` **wirklich** anhalten (der Block in `tokens.css` deckt
 * nur CSS-Dauern ab, keine Animationsschleife), und auf schmalen Fenstern soll der Canvas
 * gar nicht erst entstehen statt nur unsichtbar zu sein.
 */
export function useMediaQuery(abfrage: string): boolean {
  const [passt, setPasst] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(abfrage).matches,
  );

  useEffect(() => {
    const liste = window.matchMedia(abfrage);
    const auf = () => setPasst(liste.matches);
    auf();
    liste.addEventListener("change", auf);
    return () => liste.removeEventListener("change", auf);
  }, [abfrage]);

  return passt;
}
