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
 * "Ctrl", "Entf" heisst "Del", und "Hoch" heisst "Up". Ein englischer Nutzer, der im
 * Hilfe-Dialog "Strg+Entf" liest, sucht auf seiner Tastatur vergeblich.
 */

export type Bereich = "allgemein" | "baum" | "tabelle" | "formular";

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
  readonly bereich: Bereich;
}

export const TASTENWEGE: readonly Tastenweg[] = [
  { folgen: [["strg", "K"]], wirkung: "hilfe.palette", bereich: "allgemein" },
  { folgen: [["strg", "J"]], wirkung: "hilfe.assistent", bereich: "allgemein" },
  { folgen: [["strg", "S"]], wirkung: "hilfe.speichern", bereich: "allgemein" },
  { folgen: [["strg", "Z"]], wirkung: "hilfe.rueckgaengig", bereich: "allgemein" },
  {
    folgen: [
      ["strg", "Y"],
      ["strg", "shift", "Z"],
    ],
    wirkung: "hilfe.wiederholen",
    bereich: "allgemein",
  },

  { folgen: [["hoch"], ["runter"]], wirkung: "hilfe.bewegen", bereich: "baum" },
  { folgen: [["rechts"]], wirkung: "hilfe.aufklappen", bereich: "baum" },
  { folgen: [["links"]], wirkung: "hilfe.zuklappen", bereich: "baum" },
  { folgen: [["pos1"], ["ende"]], wirkung: "hilfe.anfangEnde", bereich: "baum" },
  { folgen: [["entf"]], wirkung: "hilfe.loeschen", bereich: "baum" },
  { folgen: [["strg", "D"]], wirkung: "hilfe.duplizieren", bereich: "baum" },
  { folgen: [["strg", "C"]], wirkung: "hilfe.kopieren", bereich: "baum" },
  { folgen: [["strg", "X"]], wirkung: "hilfe.ausschneiden", bereich: "baum" },
  { folgen: [["strg", "V"]], wirkung: "hilfe.einfuegen", bereich: "baum" },
  { folgen: [["f2"], ["enter"]], wirkung: "hilfe.idShort", bereich: "baum" },
  { folgen: [["esc"]], wirkung: "hilfe.filterLeeren", bereich: "baum" },

  { folgen: [["hoch"], ["runter"]], wirkung: "hilfe.zeileWechseln", bereich: "tabelle" },
  { folgen: [["enter"]], wirkung: "hilfe.zumFormular", bereich: "tabelle" },

  { folgen: [["enter"]], wirkung: "hilfe.feldUebernehmen", bereich: "formular" },
  { folgen: [["esc"]], wirkung: "hilfe.feldVerwerfen", bereich: "formular" },
];

/** Eine einzelne Marke in Worten. Buchstaben und Ziffern bleiben unveraendert. */
function marke(name: string): string {
  if (name.length === 1) return name;
  return i18n.t(`taste.${name}`);
}

/** Eine Folge als Text, etwa "Strg+Shift+Z" oder "Ctrl+Shift+Z". */
export function folgeAlsText(folge: Folge): string {
  return folge.map(marke).join("+");
}

/** Alle Wege zu einer Wirkung, durch Komma getrennt. Fuer den Hilfe-Dialog. */
export function tastenFuer(wirkung: string): string {
  const weg = TASTENWEGE.find((eintrag) => eintrag.wirkung === wirkung);
  return weg ? weg.folgen.map(folgeAlsText).join(", ") : "";
}

/**
 * Der **erste** Weg zu einer Wirkung. Menues und Knopfhinweise haben nur Platz fuer einen;
 * im Hilfe-Dialog stehen alle.
 */
export function ersteTasteFuer(wirkung: string): string {
  const weg = TASTENWEGE.find((eintrag) => eintrag.wirkung === wirkung);
  const erste = weg?.folgen[0];
  return erste ? folgeAlsText(erste) : "";
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
