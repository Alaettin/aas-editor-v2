import type { ValidationIssue } from "@aas-editor/core/validation";
import type { TFunction } from "i18next";

/**
 * Ein Befund in Worten.
 *
 * Der Kern liefert einen Schluessel und die Werte, nicht den Satz: er kennt keine
 * Oberflaechensprache. Uebersetzt wird hier, an einer Stelle.
 *
 * Ohne Schluessel steht die englische Rohmeldung der SDK da. Das soll seit dem 06.08.2026
 * nicht mehr vorkommen -- ein Waechter in `packages/core/test/messages.test.ts` haelt
 * `explain()` gegen **jede** Meldungsvorlage der SDK. Der Rueckfall bleibt trotzdem, denn
 * eine neue SDK-Fassung kann Saetze mitbringen, die niemand kennt. Er wird dann aber
 * ausdruecklich als unuebersetzt gekennzeichnet, statt sich als regulaerer Befundtext
 * auszugeben.
 */
export function befundText(issue: ValidationIssue, t: TFunction): string {
  if (issue.schluessel === null) return issue.message;
  return t(issue.schluessel, issue.werte) as string;
}

/** Ob der angezeigte Text die unuebersetzte Rohmeldung ist. */
export function istUnuebersetzt(issue: ValidationIssue): boolean {
  return issue.schluessel === null;
}

/**
 * Ob es hinter dem Befund noch eine Rohmeldung zum Aufklappen gibt.
 *
 * Die Datenwarnungen des Editors formuliert er selbst, sie tragen keine fremde Meldung.
 * Ein Aufklappen, hinter dem nichts steht, ist eine Enttaeuschung.
 *
 * Frueher stand hier zusaetzlich `schluessel !== null`, und damit verschwand der Knopf
 * genau dann, wenn der Text die Rohmeldung **war**: man sah einen englischen Satz und
 * hatte keinen Hinweis darauf, woher er kam.
 */
export function hatRohmeldung(issue: ValidationIssue): boolean {
  return issue.message !== "";
}
