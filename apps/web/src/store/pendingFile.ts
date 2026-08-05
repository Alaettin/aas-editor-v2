/**
 * Uebergabe einer Datei von der Projektliste an den Editor.
 *
 * Die Liste darf die Datei nicht selbst lesen: Import und Modell liegen im Worker und im
 * Kern, und beide sollen erst mit dem Editor geladen werden, nicht schon im Startbundle
 * (Plan Abschnitt 10). Die Liste merkt sich deshalb nur die Datei und den Wunschnamen,
 * der Editor holt sie ab.
 */

interface AblageEintrag {
  readonly file: File;
  readonly name: string;
}

let eintrag: AblageEintrag | null = null;

export function legeDateiAb(file: File, name: string): void {
  eintrag = { file, name };
}

/** Einmalig: der zweite Aufruf liefert null, damit ein Neuladen nichts wiederholt. */
export function holeDatei(): AblageEintrag | null {
  const aktuell = eintrag;
  eintrag = null;
  return aktuell;
}
