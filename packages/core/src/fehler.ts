/**
 * Uebersetzbare Fehler und Meldungen des Kerns.
 *
 * Der Kern kennt keine Oberflaechensprache. Er liefert deshalb einen **Schluessel** und
 * die Werte, die darin eingesetzt werden; uebersetzt wird an genau einer Stelle, in
 * `apps/web/src/lib/melden.ts`.
 */

/**
 * Werte, die in einen uebersetzten Satz eingesetzt werden. Zahlen sind erlaubt, weil
 * i18next daraus die Pluralform ableitet.
 */
export type Werte = Readonly<Record<string, string | number>>;

/**
 * `Error.message` bleibt gefuellt, mit einem englischen Entwicklertext. Er steht in
 * Protokollen und Stapelspuren, und ein Fehler ohne lesbare `message` ist beim Suchen
 * wertlos. Angezeigt wird er nie.
 */
export class KernFehler extends Error {
  readonly schluessel: string;
  readonly werte: Werte;

  constructor(schluessel: string, entwicklertext: string, werte: Werte = {}) {
    super(entwicklertext);
    this.name = "KernFehler";
    this.schluessel = schluessel;
    this.werte = werte;
  }
}

/** Ob ein Fehler einen Schluessel traegt und sich damit uebersetzen laesst. */
export function istKernFehler(fehler: unknown): fehler is KernFehler {
  return fehler instanceof KernFehler;
}
