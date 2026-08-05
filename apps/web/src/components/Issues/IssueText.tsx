import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ValidationIssue } from "@aas-editor/core/validation";

import { Chip } from "@/components/ui/chip";
import { befundText, hatRohmeldung } from "@/lib/befund";

/**
 * Ein Befund in Worten: Kennung, verstaendlicher Satz, und die Rohmeldung der SDK zum
 * Aufklappen (Plan Abschnitt 7).
 *
 * Der Satz entsteht erst hier: der Kern liefert einen Schluessel, siehe `lib/befund.ts`.
 * Die Rohmeldung wird nur angeboten, wenn es ueberhaupt eine gibt. Ein Aufklappen,
 * hinter dem nichts steht, ist eine Enttaeuschung.
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
  const hasRaw = withRaw && hatRohmeldung(issue);

  return (
    <span className="inline">
      {issue.constraintId ? (
        <Chip
          data-numeric
          tone="warn"
          fill={issue.severity === "constraint" ? "solid" : "soft"}
          pill
          mono
          className="mr-1.5"
        >
          {issue.constraintId}
        </Chip>
      ) : null}
      {befundText(issue, t)}
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
