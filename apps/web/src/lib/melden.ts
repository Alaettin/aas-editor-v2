import { istKernFehler } from "@aas-editor/core";
import { toast } from "sonner";

import i18n from "@/i18n";

/**
 * Kurze Rueckmeldungen an den Nutzer, an einer Stelle.
 *
 * Vorher gab es keine einzige Erfolgsmeldung im ganzen Programm, und Fehler landeten in
 * einem festen Kasten unten rechts, der sich nicht schliessen liess und hinter jedem
 * offenen Dialog verschwand.
 *
 * Bewusst ohne React: die Meldungen entstehen im Speicher, nicht in einem Bauteil. Der
 * Uebersetzer wird deshalb direkt genommen und nicht ueber `useTranslation` gereicht.
 *
 * **Keine Meldung ersetzt einen Zustand am Ort.** Ein Dialog, dessen Aktion scheitert,
 * zeigt den Fehler weiterhin bei sich selbst; der Toaster ist die zusaetzliche, nicht
 * die einzige Nachricht.
 */

function text(schluessel: string, werte?: Record<string, unknown>): string {
  return i18n.t(schluessel, werte ?? {});
}

/** Etwas hat geklappt. Kurz, ohne Knopf, verschwindet von selbst. */
export function meldeErfolg(schluessel: string, werte?: Record<string, unknown>): void {
  toast.success(text(schluessel, werte));
}

/**
 * Etwas ist schiefgegangen.
 *
 * Bleibt laenger stehen als eine Erfolgsmeldung und laesst sich schliessen: einen Fehler
 * soll man lesen koennen, auch wenn man gerade woanders hinsieht.
 */
export function meldeFehler(fehler: unknown, schluessel?: string): void {
  // Der Kern kennt keine Sprache: er wirft einen Schluessel und die Werte dazu.
  // `Error.message` traegt dort nur den englischen Entwicklertext fuer Protokolle.
  const grund = istKernFehler(fehler)
    ? text(fehler.schluessel, fehler.werte)
    : fehler instanceof Error
      ? fehler.message
      : String(fehler);
  toast.error(schluessel ? text(schluessel) : grund, {
    description: schluessel ? grund : undefined,
    duration: 10000,
    closeButton: true,
  });
}

/** Ein Hinweis ohne Wertung, etwa dass die lokale Sicherung nicht schreiben kann. */
export function meldeHinweis(schluessel: string, werte?: Record<string, unknown>): void {
  toast.warning(text(schluessel, werte), { duration: 8000, closeButton: true });
}
