import type { ValidationIssue } from "@aas-editor/core/validation";
import type { TFunction } from "i18next";

/**
 * Ein Befund in Worten.
 *
 * Der Kern liefert einen Schluessel und die Werte, nicht den Satz: er kennt keine
 * Oberflaechensprache. Uebersetzt wird hier, an einer Stelle, und wenn es keinen
 * Schluessel gibt, steht die Rohmeldung der SDK da. Eine erfundene Uebersetzung waere
 * schlechter als eine englische Meldung, die wenigstens stimmt.
 */
export function befundText(issue: ValidationIssue, t: TFunction): string {
  if (issue.schluessel === null) return issue.message;
  return t(issue.schluessel, issue.werte) as string;
}

/**
 * Ob es hinter dem Befund noch eine Rohmeldung zum Aufklappen gibt.
 *
 * Die Datenwarnungen des Editors formuliert er selbst, sie tragen keine fremde Meldung.
 * Ein Aufklappen, hinter dem nichts oder dasselbe steht, ist eine Enttaeuschung.
 */
export function hatRohmeldung(issue: ValidationIssue): boolean {
  return issue.schluessel !== null && issue.message !== "";
}
