/**
 * Die Tastenwege, an genau einer Stelle.
 *
 * Vorher standen sie fuenffach im Code: in der Menuezeile, der Werkzeugleiste, dem
 * Hilfe-Dialog, der Kommando-Palette und dem Filterfeld. Sie waren bereits
 * auseinandergelaufen. `Strg+Shift+Z` gab es seit Phase 4 als zweiten Weg zum
 * Wiederholen, dokumentiert war er nirgends, und `Escape` im Filter ebenso wenig.
 *
 * Diese Datei beschreibt nur, **was** wo steht. Ausgeloest werden die Wege weiterhin
 * dort, wo sie hingehoeren: die globalen in `AppShell`, die des Baums in `Tree`, die der
 * Felder im jeweiligen Editor. Eine zentrale Ausloesung waere eine zweite Wahrheit ueber
 * den Zustand und damit genau das Problem, das hier behoben wird.
 */

export type Bereich = "allgemein" | "baum" | "tabelle" | "formular";

export interface Tastenweg {
  /** Wie die Tasten dem Nutzer gezeigt werden, etwa "Strg+S". */
  readonly tasten: string;
  /** Schluessel der Beschreibung in de.json */
  readonly wirkung: string;
  readonly bereich: Bereich;
}

export const TASTENWEGE: readonly Tastenweg[] = [
  { tasten: "Strg+K", wirkung: "hilfe.palette", bereich: "allgemein" },
  { tasten: "Strg+J", wirkung: "hilfe.assistent", bereich: "allgemein" },
  { tasten: "Strg+S", wirkung: "hilfe.speichern", bereich: "allgemein" },
  { tasten: "Strg+Z", wirkung: "hilfe.rueckgaengig", bereich: "allgemein" },
  { tasten: "Strg+Y, Strg+Shift+Z", wirkung: "hilfe.wiederholen", bereich: "allgemein" },

  { tasten: "Hoch, Runter", wirkung: "hilfe.bewegen", bereich: "baum" },
  { tasten: "Rechts", wirkung: "hilfe.aufklappen", bereich: "baum" },
  { tasten: "Links", wirkung: "hilfe.zuklappen", bereich: "baum" },
  { tasten: "Pos1, Ende", wirkung: "hilfe.anfangEnde", bereich: "baum" },
  { tasten: "Entf", wirkung: "hilfe.loeschen", bereich: "baum" },
  { tasten: "Strg+D", wirkung: "hilfe.duplizieren", bereich: "baum" },
  { tasten: "Strg+C", wirkung: "hilfe.kopieren", bereich: "baum" },
  { tasten: "Strg+X", wirkung: "hilfe.ausschneiden", bereich: "baum" },
  { tasten: "Strg+V", wirkung: "hilfe.einfuegen", bereich: "baum" },
  { tasten: "F2, Enter", wirkung: "hilfe.idShort", bereich: "baum" },
  { tasten: "Esc", wirkung: "hilfe.filterLeeren", bereich: "baum" },

  { tasten: "Hoch, Runter", wirkung: "hilfe.zeileWechseln", bereich: "tabelle" },
  { tasten: "Enter", wirkung: "hilfe.zumFormular", bereich: "tabelle" },

  { tasten: "Enter", wirkung: "hilfe.feldUebernehmen", bereich: "formular" },
  { tasten: "Esc", wirkung: "hilfe.feldVerwerfen", bereich: "formular" },
];

/** Die Tasten eines Weges, fuer die Anzeige im Menue oder an einem Knopf. */
export function tastenFuer(wirkung: string): string {
  return TASTENWEGE.find((weg) => weg.wirkung === wirkung)?.tasten ?? "";
}

/**
 * Die **erste** Tastenfolge eines Weges. Menues und Knopfhinweise haben nur Platz fuer
 * eine; im Hilfe-Dialog stehen alle.
 */
export function ersteTasteFuer(wirkung: string): string {
  return tastenFuer(wirkung).split(",")[0]?.trim() ?? "";
}

export const BEREICHE: readonly { bereich: Bereich; titel: string }[] = [
  { bereich: "allgemein", titel: "hilfe.gruppeAllgemein" },
  { bereich: "baum", titel: "hilfe.gruppeBaum" },
  { bereich: "tabelle", titel: "hilfe.gruppeTabelle" },
  { bereich: "formular", titel: "hilfe.gruppeFormular" },
];

/**
 * Ob ein Tastendruck in einem Eingabefeld passiert.
 *
 * Die globalen Wege haengen am Fenster und griffen bisher ueberall: `Strg+Z` in einem
 * Textfeld machte globales Rueckgaengig statt das erwartete Rueckgaengig im Feld. Das ist
 * kein Randfall, sondern der haeufigste Handgriff ueberhaupt.
 */
export function inEingabefeld(ziel: EventTarget | null): boolean {
  if (!(ziel instanceof HTMLElement)) return false;
  if (ziel.isContentEditable) return true;
  const name = ziel.tagName;
  return name === "INPUT" || name === "TEXTAREA" || name === "SELECT";
}
