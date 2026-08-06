import i18n from "@/i18n";

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
 *
 * Die Tasten stehen als **Marken**, nicht als fertiger Text: "Strg" heisst auf Englisch
 * "Ctrl", "Entf" heisst "Del", und "Hoch" heisst "Up". Ein englischer Nutzer, der auf einem
 * Knopf "Strg+Entf" liest, sucht auf seiner Tastatur vergeblich.
 *
 * Seit dem 06.08.2026 gibt es den Hilfe-Dialog nicht mehr. Uebrig bleiben die Hinweise an
 * den Knoepfen, also `ersteTasteFuer`; die Gruppierung nach Bereichen ist mit dem Dialog
 * gefallen.
 */

/**
 * Eine Tastenfolge als Marken, etwa `["strg", "shift", "z"]`.
 *
 * Einzelne Buchstaben und Ziffern bleiben, wie sie sind: die Taste `Z` heisst in jeder
 * Sprache `Z`. Alles andere wird ueber `taste.*` uebersetzt.
 */
export type Folge = readonly string[];

export interface Tastenweg {
  /** Alle Wege zur selben Wirkung. Der erste ist der, den Menues zeigen. */
  readonly folgen: readonly Folge[];
  /** Schluessel der Beschreibung in den Sprachdateien */
  readonly wirkung: string;
}

export const TASTENWEGE: readonly Tastenweg[] = [
  { folgen: [["strg", "K"]], wirkung: "hilfe.palette" },
  { folgen: [["strg", "J"]], wirkung: "hilfe.assistent" },
  { folgen: [["strg", "S"]], wirkung: "hilfe.speichern" },
  { folgen: [["strg", "Z"]], wirkung: "hilfe.rueckgaengig" },
  {
    folgen: [
      ["strg", "Y"],
      ["strg", "shift", "Z"],
    ],
    wirkung: "hilfe.wiederholen",
  },

  { folgen: [["hoch"], ["runter"]], wirkung: "hilfe.bewegen" },
  { folgen: [["rechts"]], wirkung: "hilfe.aufklappen" },
  { folgen: [["links"]], wirkung: "hilfe.zuklappen" },
  { folgen: [["pos1"], ["ende"]], wirkung: "hilfe.anfangEnde" },
  { folgen: [["entf"]], wirkung: "hilfe.loeschen" },
  { folgen: [["strg", "D"]], wirkung: "hilfe.duplizieren" },
  { folgen: [["strg", "C"]], wirkung: "hilfe.kopieren" },
  { folgen: [["strg", "X"]], wirkung: "hilfe.ausschneiden" },
  { folgen: [["strg", "V"]], wirkung: "hilfe.einfuegen" },
  { folgen: [["f2"], ["enter"]], wirkung: "hilfe.idShort" },
  { folgen: [["esc"]], wirkung: "hilfe.filterLeeren" },

  { folgen: [["enter"]], wirkung: "hilfe.feldUebernehmen" },
  { folgen: [["esc"]], wirkung: "hilfe.feldVerwerfen" },
];

/** Eine einzelne Marke in Worten. Buchstaben und Ziffern bleiben unveraendert. */
function marke(name: string): string {
  if (name.length === 1) return name;
  return i18n.t(`taste.${name}`);
}

/** Eine Folge als Text, etwa "Strg+Shift+Z" oder "Ctrl+Shift+Z". */
function folgeAlsText(folge: Folge): string {
  return folge.map(marke).join("+");
}

/** Der **erste** Weg zu einer Wirkung. Ein Knopfhinweis hat nur Platz fuer einen. */
export function ersteTasteFuer(wirkung: string): string {
  const weg = TASTENWEGE.find((eintrag) => eintrag.wirkung === wirkung);
  const erste = weg?.folgen[0];
  return erste ? folgeAlsText(erste) : "";
}

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
