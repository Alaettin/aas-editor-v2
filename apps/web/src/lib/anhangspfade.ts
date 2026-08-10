/**
 * Pfade in den Paketcontainer.
 *
 * Ein Anhang wird ueber seinen Pfad angesprochen, und der Pfad ist damit seine Kennung:
 * zwei Elemente mit demselben Pfad meinen **dieselbe** Datei. Wer das uebersieht,
 * ueberschreibt beim Ersetzen fremde Anhaenge mit.
 *
 * Steht hier und nicht in der Anzeigeflaeche `Medien.tsx`: der Feldeditor braucht dieselben
 * Regeln, und ein Feldeditor, der sich seine Pfadlogik aus einer Anzeige holt, hat die
 * Abhaengigkeit verkehrt herum.
 */

import type { EditorModel } from "@aas-editor/core";
// Aus dem Untermodul, nicht aus dem Buendel: `@aas-editor/core/io` zieht die SDK herein und
// gehoert in den Worker. `io/attachments` kommt ohne sie aus.
import { collectPackageReferences } from "@aas-editor/core/io/attachments";

/** Der Ort, an dem ein neu hochgeladener Anhang landet, wenn noch kein Pfad dasteht. */
const SUPPL = "/aasx/suppl";

/** Paketpfade sind absolut. Ein fehlender fuehrender Schraegstrich ist ein Tippfehler. */
export function normalisiere(pfad: string): string {
  return pfad.startsWith("/") ? pfad : `/${pfad}`;
}

/** Der Dateiname aus einem Paketpfad. Er, nicht der idShort, gehoert an den Download. */
export function dateinameVon(pfad: string): string {
  return pfad.split("/").pop() ?? "anhang";
}

/** Der Paketpfad fuer eine neu gewaehlte Datei, wenn das File-Element noch keinen traegt. */
export function vorschlagsPfad(dateiname: string): string {
  const sauber = dateiname.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${SUPPL}/${sauber === "" ? "anhang" : sauber}`;
}

/**
 * Ein Pfad, unter dem noch nichts liegt: `bild.png`, sonst `bild-2.png`, `bild-3.png`.
 *
 * Gezaehlt wird **vor** der Endung. `bild.png-2` waere fuer jedes Programm eine Datei ohne
 * Typ, und der Download brauchte danach einen Namen von Hand.
 *
 * @param belegt Sagt, ob unter einem Pfad schon etwas liegt.
 */
export function freierPfad(dateiname: string, belegt: (pfad: string) => boolean): string {
  const vorschlag = vorschlagsPfad(dateiname);
  if (!belegt(vorschlag)) return vorschlag;

  const punkt = vorschlag.lastIndexOf(".");
  const schraeg = vorschlag.lastIndexOf("/");
  // Ein Punkt im Ordnernamen ist keine Endung: `/aasx/v1.0/bild` hat keine.
  const hatEndung = punkt > schraeg + 1;
  const stamm = hatEndung ? vorschlag.slice(0, punkt) : vorschlag;
  const endung = hatEndung ? vorschlag.slice(punkt) : "";

  // Die Obergrenze ist ein Notausgang, kein Grenzwert: sie greift erst, wenn jemand
  // dieselbe Datei tausendmal ablegt, und eine Endlosschleife waere hier ein stehendes
  // Programm ohne jede Meldung.
  for (let n = 2; n < 1000; n += 1) {
    const naechster = `${stamm}-${n}${endung}`;
    if (!belegt(naechster)) return naechster;
  }
  throw new Error(`Kein freier Pfad fuer ${dateiname}`);
}

export interface Ziel {
  /** Wohin die neuen Bytes gehen. */
  readonly ziel: string;
  /** Ob dafuer ein eigener Pfad angelegt wurde, weil die alte Datei geteilt war. */
  readonly abgezweigt: boolean;
}

/**
 * Wohin die neu gewaehlte Datei eines Elements geht.
 *
 * Der Paketpfad ist die Kennung eines Anhangs: zwei Elemente mit demselben Pfad meinen
 * **dieselbe** Datei. In echten Herstellerdateien kommt das vor, `defaultThumbnail` und ein
 * `File`-Element zeigen dort gern auf dasselbe Produktbild. "Ersetzen" an einem der beiden
 * aenderte damit stillschweigend auch das andere, gemeldet am 10.08.2026.
 *
 * Deshalb: teilen sich mehrere Stellen die Datei, wird **abgezweigt**. Die neuen Bytes
 * bekommen einen eigenen Pfad, und nur dieses Element zeigt darauf; der andere Verweis
 * behaelt sein Bild. Zeigt nur diese eine Stelle darauf, wird an Ort und Stelle ersetzt,
 * damit Pfade im Normalfall stabil bleiben.
 *
 * @param pfad Der Pfad, der heute im Feld steht. Leer heisst: es gibt noch keinen.
 * @param belegt Sagt, ob unter einem Pfad schon ein Anhang liegt.
 */
export function zielPfad(
  pfad: string,
  dateiname: string,
  model: EditorModel | null,
  belegt: (kandidat: string) => boolean,
): Ziel {
  if (pfad === "") return { ziel: freierPfad(dateiname, belegt), abgezweigt: false };

  const eigen = normalisiere(pfad);
  if (!model) return { ziel: eigen, abgezweigt: false };

  const verweise = collectPackageReferences(model).filter(
    (verweis) => verweis.path === eigen,
  ).length;
  if (verweise <= 1) return { ziel: eigen, abgezweigt: false };

  return { ziel: freierPfad(dateiname, belegt), abgezweigt: true };
}
