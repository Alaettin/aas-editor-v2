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
    pruefe(fehler, schluessel);
    return;
  }
  throw new Error(`Erwartet wurde ein KernFehler mit "${schluessel}", es kam keiner.`);
}

/**
 * Dasselbe fuer eine Arbeit, die ein Versprechen zurueckgibt.
 *
 * Eine eigene Funktion und keine Erweiterung der obigen: ohne `await` faengt das `catch`
 * dort **nichts**, die Ablehnung kaeme erst nach dem Test an, und die Pruefung waere
 * stillschweigend gruen, ohne je etwas gesehen zu haben.
 */
export async function wirftSchluesselAsync(
  arbeit: () => Promise<unknown>,
  schluessel: string,
): Promise<void> {
  try {
    await arbeit();
  } catch (fehler) {
    pruefe(fehler, schluessel);
    return;
  }
  throw new Error(`Erwartet wurde ein KernFehler mit "${schluessel}", es kam keiner.`);
}

function pruefe(fehler: unknown, schluessel: string): void {
  expect(istKernFehler(fehler), `kein KernFehler: ${String(fehler)}`).toBe(true);
  expect((fehler as KernFehler).schluessel).toBe(schluessel);
}
