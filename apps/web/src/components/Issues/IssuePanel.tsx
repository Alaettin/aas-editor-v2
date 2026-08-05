import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronDown, ShieldAlert, X } from "lucide-react";
import type { ValidationIssue } from "@aas-editor/core/validation";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { useEditor } from "@/store/editor";
import { IssueText } from "./IssueText";
import { hatRohmeldung } from "@/lib/befund";

/**
 * Das sammelnde Panel (Plan Abschnitt 7). Unten ueber die volle Breite, zugeklappt
 * kostet es nichts.
 *
 * Klick auf eine Zeile springt zum Element und fokussiert das Feld. Constraints stehen
 * vor Warnungen, darin bleibt die Dokumentreihenfolge erhalten: so liest sich die Liste
 * wie der Baum.
 */
export function IssuePanel() {
  const { t } = useTranslation();
  const issues = useEditor((state) => state.issues);
  const pruefung = useEditor((state) => state.pruefung);
  const model = useEditor((state) => state.model);
  const selection = useEditor((state) => state.selection);
  const goToIssue = useEditor((state) => state.goToIssue);
  const setOpen = useEditor((state) => state.setIssuePanelOpen);

  const sorted = useMemo(() => {
    const rank = (issue: ValidationIssue) => (issue.severity === "constraint" ? 0 : 1);
    return [...issues].sort((a, b) => rank(a) - rank(b));
  }, [issues]);

  const labelOf = (issue: ValidationIssue): string => {
    if (!model || !issue.nodeId) return "";
    const node = model.nodes[issue.nodeId];
    if (!node) return "";
    const idShort = node.data["idShort"];
    return typeof idShort === "string" && idShort ? idShort : node.kind;
  };

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3">
        <ChevronDown className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{t("befund.titel")}</span>
        <span className="text-2xs text-muted-foreground" data-numeric>
          {t("status.constraints", {
            count: issues.filter((i) => i.severity === "constraint").length,
          })}
          {", "}
          {t("status.warnungen", {
            count: issues.filter((i) => i.severity === "warnung").length,
          })}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto"
          aria-label={t("befund.schliessen")}
          onClick={() => setOpen(false)}
        >
          <X />
        </Button>
      </div>

      {sorted.length === 0 ? (
        <Empty className="flex-1">
          <EmptyHeader>
            {/*
              Waehrend die Pruefung laeuft, waere "keine Befunde" eine Behauptung ueber
              etwas, das noch niemand geprueft hat. Bei zehntausend Elementen dauert das
              lange genug, dass man sie glaubt.
            */}
            <EmptyTitle>
              {pruefung === "laeuft" ? t("befund.prueft") : t("befund.leerTitel")}
            </EmptyTitle>
            <EmptyDescription>{pruefung === "laeuft" ? "" : t("befund.leerText")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex-1 overflow-auto p-1">
          {sorted.map((issue, index) => (
            <IssueRow
              key={`${issue.aasPath}-${index}`}
              issue={issue}
              label={labelOf(issue)}
              selected={issue.nodeId === selection}
              onJump={() => goToIssue(issue)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Eine Zeile des Panels.
 *
 * Der Sprung ist ein echter Knopf, damit Tastatur und Vorlesesoftware ihn finden. Die
 * Rohmeldung haengt als eigener Knopf **daneben**, nicht darin: ein Knopf im Knopf ist
 * ungueltiges HTML, und React beanstandet ihn zu Recht.
 */
function IssueRow({
  issue,
  label,
  selected,
  onJump,
}: {
  readonly issue: ValidationIssue;
  readonly label: string;
  readonly selected: boolean;
  readonly onJump: () => void;
}) {
  const { t } = useTranslation();
  const [rawOpen, setRawOpen] = useState(false);
  const hasRaw = hatRohmeldung(issue);

  return (
    <li className={"rounded-sm " + (selected ? "bg-selected" : "hover:bg-accent")}>
      <div className="flex items-start gap-2 px-2 py-1.5 text-xs">
        {issue.severity === "constraint" ? (
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
        ) : (
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
        )}

        <button type="button" data-issue-row className="min-w-0 flex-1 text-left" onClick={onJump}>
          <IssueText issue={issue} withRaw={false} />
        </button>

        {hasRaw ? (
          <button
            type="button"
            className="shrink-0 text-2xs text-muted-foreground underline underline-offset-2"
            onClick={() => setRawOpen((current) => !current)}
          >
            {rawOpen ? t("befund.originalAus") : t("befund.original")}
          </button>
        ) : null}

        <span className="shrink-0 text-2xs text-muted-foreground">
          {label}
          {issue.field ? <span className="ml-1 font-mono">{issue.field}</span> : null}
        </span>
      </div>

      {rawOpen ? (
        <p className="px-2 pb-2 pl-7 font-mono text-2xs text-muted-foreground">{issue.message}</p>
      ) : null}
    </li>
  );
}
