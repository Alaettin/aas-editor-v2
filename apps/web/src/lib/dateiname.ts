/**
 * Dateinamen fuer den Export.
 *
 * Steht hier und nicht im Editor-Speicher, weil auch der Einstieg exportiert und dort kein
 * Editor geladen ist. Zwei Fassungen derselben Regel wuerden frueher oder spaeter
 * auseinanderlaufen.
 */

/** Die Endung tauschen, den Rest des Namens behalten. */
export function benenneUm(fileName: string, format: "json" | "xml" | "aasx"): string {
  const stamm = fileName.replace(/\.(json|xml|aasx)$/i, "");
  return `${stamm}.${format}`;
}

/**
 * Ein Projektname ist kein Dateiname: er darf Zeichen tragen, an denen Windows und Linux
 * sich stossen, und er darf leer werden, wenn man sie alle entfernt.
 */
export function alsDateiname(name: string, format: "json" | "xml" | "aasx"): string {
  const sauber = name
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return `${sauber === "" ? "projekt" : sauber}.${format}`;
}
