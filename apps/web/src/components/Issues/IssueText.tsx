import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ValidationIssue } from "@aas-editor/core/validation";

/**
 * Ein Befund in Worten: Kennung, verstaendlicher Satz, und die Rohmeldung der SDK zum
 * Aufklappen (Plan Abschnitt 7).
 *
 * Die Rohmeldung wird nur angeboten, wenn sie ueberhaupt etwas anderes sagt als der
 * uebersetzte Satz. Ein Aufklappen, hinter dem dasselbe steht, ist eine Enttaeuschung.
 */
export function IssueText({
  issue,
  withRaw = true,
}: {
  readonly issue: ValidationIssue;
  /**
   * Im Befund-Panel ist die ganze Zeile ein Knopf. Ein Knopf im Knopf ist ungueltiges
   * HTML, deshalb setzt das Panel den Umschalter daneben statt hinein.
   */
  readonly withRaw?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const hasRaw = withRaw && issue.translated && issue.message !== issue.title;

  return (
    <span className="inline">
      {issue.constraintId ? (
        <span
          data-numeric
          className="mr-1.5 rounded-xs bg-muted px-1 py-px text-2xs text-muted-foreground"
        >
          {issue.constraintId}
        </span>
      ) : null}
      {issue.title}
      {hasRaw ? (
        <>
          {" "}
          <button
            type="button"
            className="text-2xs text-muted-foreground underline underline-offset-2"
            onClick={() => setOpen((current) => !current)}
          >
            {open ? t("befund.originalAus") : t("befund.original")}
          </button>
          {open ? (
            <span className="mt-1 block font-mono text-2xs text-muted-foreground">
              {issue.message}
            </span>
          ) : null}
        </>
      ) : null}
    </span>
  );
}
