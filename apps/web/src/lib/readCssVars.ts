/**
 * Textwerte von CSS-Variablen, gelesen an einem bestimmten Element.
 *
 * Gegenstueck zu `useCssPx`, das Zahlen an der Wurzel liest. Hier zaehlt der
 * Geltungsbereich: die Farben der Anmeldebuehne stehen in `.szene-axon`, also muss am
 * Canvas gelesen werden und nicht am Wurzelelement.
 *
 * Bewusst **keine Hook**: ein Objekt je Rendern waere eine Abhaengigkeit des Effekts und
 * wuerde die Animationsschleife bei jedem Rendern neu starten. Einmal beim Mounten lesen
 * genuegt, die Werte haengen an keinem Thema.
 *
 * Der Rueckfall ist absichtlich `transparent` und kein Farbwert: faellt die CSS aus, bleibt
 * das Bild leer statt bunt daneben, und im Code steht weiterhin kein Einzelwert.
 */
export function readCssVars<N extends string>(
  element: Element,
  namen: readonly N[],
  rueckfall = "transparent",
): Record<N, string> {
  const stil = getComputedStyle(element);
  const werte = {} as Record<N, string>;
  for (const name of namen) {
    werte[name] = stil.getPropertyValue(name).trim() || rueckfall;
  }
  return werte;
}
