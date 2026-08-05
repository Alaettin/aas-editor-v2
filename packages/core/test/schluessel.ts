import { expect } from "vitest";

import { istKernFehler, type KernFehler } from "../src/fehler.js";

/**
 * Prueft den **Schluessel** eines Kernfehlers, nicht seinen Satz.
 *
 * Seit der Kern keine Oberflaechensprache mehr kennt, traegt `Error.message` nur einen
 * englischen Entwicklertext fuer Protokolle. Die Zusage, auf die sich ein Test berufen
 * darf, ist der Schluessel: an ihm haengt, was der Nutzer liest, und er ist zugleich die
 * schaerfere Aussage als ein Textausschnitt.
 */
export function wirftSchluessel(arbeit: () => unknown, schluessel: string): void {
  try {
    arbeit();
  } catch (fehler) {
    expect(istKernFehler(fehler), `kein KernFehler: ${String(fehler)}`).toBe(true);
    expect((fehler as KernFehler).schluessel).toBe(schluessel);
    return;
  }
  throw new Error(`Erwartet wurde ein KernFehler mit "${schluessel}", es kam keiner.`);
}
