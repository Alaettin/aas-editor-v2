import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Copy, Trash2 } from "lucide-react";
import { specOf } from "@aas-editor/core";
import { topLevelField, type ValidationIssue } from "@aas-editor/core/validation";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { FieldGroup } from "@/components/ui/field";
import { SectionLabel } from "@/components/ui/section-label";
import { toneOf } from "@/lib/typeOf";
import { useEditor } from "@/store/editor";
import { pathTo, shortenMiddle } from "@/store/rows";
import { ConceptCard } from "./ConceptCard";
import { ContextCard } from "./ContextCard";
import { FieldRenderer } from "./FieldRenderer";

/**
 * Das Eigenschaftsformular. Es rendert nichts Typspezifisches selbst, sondern arbeitet
 * die Typbeschreibung aus `packages/core/src/schema` ab (Plan Abschnitt 5).
 *
 * Zwei Spalten: links die bearbeitbaren Gruppen als Karten, rechts nur Lesbares, naemlich
 * die Herkunft der Bedeutung (ConceptDescription) und der Ort im Modell. Damit steht die
 * Definition dort, wo der Wert eingetragen wird, statt eine Sicht weiter.
 */
export function Inspector() {
  const { t } = useTranslation();
  const model = useEditor((state) => state.model);
  const selection = useEditor((state) => state.selection);
  const issues = useEditor((state) => state.issues);
  const focusRequest = useEditor((state) => state.focusRequest);
  const updateField = useEditor((state) => state.updateField);
  const clearFocusRequest = useEditor((state) => state.clearFocusRequest);
  const select = useEditor((state) => state.select);
  const duplicateElement = useEditor((state) => state.duplicateElement);
  const requestDelete = useEditor((state) => state.requestDelete);
  const issuePanelOpen = useEditor((state) => state.issuePanelOpen);
  const setIssuePanelOpen = useEditor((state) => state.setIssuePanelOpen);

  const node = model && selection ? model.nodes[selection] : undefined;
  const spec = node ? specOf(node.kind) : undefined;

  /** Welche Gruppen sind aufgeklappt. Gesteuert, damit ein Sprung sie oeffnen kann. */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // Beim Wechsel des Elements gilt wieder die Vorgabe des Deskriptors.
  useEffect(() => {
    if (!spec) return;
    const next: Record<string, boolean> = {};
    for (const group of spec.groups) next[group.title] = !group.collapsed;
    setOpenGroups(next);
  }, [spec, selection]);

  /** Befunde dieses Knotens, nach oberstem Feld gebuendelt. */
  const issuesByField = useMemo(() => {
    const map = new Map<string, ValidationIssue[]>();
    if (!selection) return map;
    for (const issue of issues) {
      if (issue.nodeId !== selection) continue;
      const key = topLevelField(issue.field);
      const bucket = map.get(key);
      if (bucket) bucket.push(issue);
      else map.set(key, [issue]);
    }
    return map;
  }, [issues, selection]);

  // Sprung aus dem Panel: Gruppe aufklappen, hinscrollen, erste Bedienung fokussieren.
  useLayoutEffect(() => {
    if (!focusRequest || !spec || focusRequest.nodeId !== selection) return;

    const key = topLevelField(focusRequest.field);
    const group = spec.groups.find((entry) => entry.fields.some((field) => field.key === key));
    if (group) setOpenGroups((current) => ({ ...current, [group.title]: true }));

    // Ein Bild spaeter, damit die aufgeklappte Gruppe im DOM steht.
    const id = requestAnimationFrame(() => {
      const container = document.querySelector<HTMLElement>(`[data-field-key="${key}"]`);
      container?.scrollIntoView({ block: "center", behavior: "smooth" });
      // Nicht das Feld selbst fokussieren: ein Feld kann ein ganzer Block sein
      // (assetInformation), fokussierbar ist erst die Bedienung darin.
      const focusable = container?.querySelector<HTMLElement>(
        "input, select, textarea, button, [tabindex]",
      );
      focusable?.focus();
      clearFocusRequest();
    });
    return () => cancelAnimationFrame(id);
  }, [focusRequest, spec, selection, clearFocusRequest]);

  const breadcrumb = useMemo(() => {
    if (!model || !selection) return [];
    return pathTo(model, selection).map((id) => {
      const current = model.nodes[id];
      const idShort = current?.data["idShort"];
      return {
        nodeId: id,
        label: typeof idShort === "string" && idShort ? idShort : (current?.kind ?? id),
      };
    });
  }, [model, selection]);

  if (!model || !node || !spec) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyTitle>{t("inspektor.nichtsGewaehlt")}</EmptyTitle>
          <EmptyDescription>{t("inspektor.nichtsGewaehltText")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const eigeneBefunde = issues.filter((issue) => issue.nodeId === selection).length;
  const istWurzel = node.parent === null;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="shrink-0 px-7 pt-3.5">
        <nav aria-label="Pfad" className="flex flex-wrap items-center gap-1 text-xs">
          {breadcrumb.map((entry, index) => (
            <span key={entry.nodeId} className="flex items-center gap-1">
              {index > 0 ? <span className="text-muted-foreground">/</span> : null}
              <button
                type="button"
                className={
                  index === breadcrumb.length - 1
                    ? "truncate font-medium text-foreground"
                    : "truncate text-muted-foreground hover:text-foreground"
                }
                onClick={() => select(entry.nodeId)}
              >
                {entry.label}
              </button>
            </span>
          ))}
        </nav>

        <div className="mt-1.5 flex items-center gap-2.5">
          <h2 className="truncate font-display text-xl font-bold">
            {typeof node.data["idShort"] === "string" && node.data["idShort"]
              ? (node.data["idShort"] as string)
              : t("baum.ohneName")}
          </h2>
          <Chip tone={toneOf(node.kind)} size="sm" mono>
            {node.kind}
          </Chip>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={istWurzel}
              onClick={() => duplicateElement(node.nodeId)}
            >
              <Copy data-icon="inline-start" />
              {t("menu.duplizieren")}
            </Button>
            <Button
              variant="danger-outline"
              size="sm"
              disabled={istWurzel}
              onClick={() => requestDelete([node.nodeId])}
            >
              <Trash2 data-icon="inline-start" />
              {t("menu.loeschen")}
            </Button>
          </div>
        </div>

        {typeof node.data["id"] === "string" ? (
          <p
            className="mt-1 truncate font-mono text-2xs text-mono-foreground"
            title={node.data["id"]}
          >
            {shortenMiddle(node.data["id"], 60)}
          </p>
        ) : null}
      </header>

      <div className="flex flex-1 items-start gap-4 overflow-auto px-7 py-4">
        {/* Linke Spalte: die Gruppen des Deskriptors, je Gruppe eine Karte. */}
        <div className="flex max-w-[640px] flex-[1.35] flex-col gap-3.5">
          {spec.groups.map((group) => {
            const groupIssues = group.fields.reduce(
              (sum, field) => sum + (issuesByField.get(field.key)?.length ?? 0),
              0,
            );

            return (
              <section
                key={group.title}
                className="rounded-4xl border border-border bg-card px-4.5 py-4"
              >
                <Collapsible
                  open={openGroups[group.title] ?? !group.collapsed}
                  onOpenChange={(open) =>
                    setOpenGroups((current) => ({ ...current, [group.title]: open }))
                  }
                >
                  <CollapsibleTrigger className="group mb-3 flex w-full items-center gap-1.5">
                    <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                    <SectionLabel>{t(group.title)}</SectionLabel>
                    {groupIssues > 0 ? (
                      <Chip tone="warn" fill="solid" pill data-numeric>
                        {groupIssues}
                      </Chip>
                    ) : null}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <FieldGroup className="gap-4">
                      {group.fields.map((field) => (
                        <FieldRenderer
                          key={field.key}
                          spec={field}
                          data={node.data}
                          issues={issuesByField.get(field.key)}
                          onChange={(key, value) => updateField(node.nodeId, key, value)}
                        />
                      ))}
                    </FieldGroup>
                  </CollapsibleContent>
                </Collapsible>
              </section>
            );
          })}
        </div>

        {/* Rechte Spalte: nur Lesbares, Herkunft der Bedeutung und Ort im Modell. */}
        <div className="flex min-w-[300px] flex-1 flex-col gap-3.5">
          <ConceptCard model={model} node={node} />
          <ContextCard model={model} node={node} />
        </div>
      </div>

      {issues.length > 0 ? (
        <button
          type="button"
          onClick={() => setIssuePanelOpen(!issuePanelOpen)}
          className="flex shrink-0 items-center gap-2.5 border-t border-border bg-card px-7 py-2.5 text-left text-xs hover:bg-accent"
        >
          <span aria-hidden className="size-[7px] rounded-full bg-warning" />
          <span className="font-semibold text-warning-text" data-numeric>
            {t("formular.befunde", { count: issues.length })}
          </span>
          <span className="text-muted-foreground" data-numeric>
            {t("formular.befundeImElement", { count: eigeneBefunde })}
          </span>
          <span className="ml-auto text-foreground-faint">
            {issuePanelOpen ? t("formular.zuklappen") : t("formular.aufklappen")}
          </span>
        </button>
      ) : null}
    </div>
  );
}
