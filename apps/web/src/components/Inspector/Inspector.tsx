import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { specOf } from "@aas-editor/core";
import { topLevelField, type ValidationIssue } from "@aas-editor/core/validation";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { useEditor } from "@/store/editor";
import { pathTo, shortenMiddle } from "@/store/rows";
import { FieldRenderer } from "./FieldRenderer";

/**
 * Das Eigenschaftsformular. Es rendert nichts Typspezifisches selbst, sondern arbeitet
 * die Typbeschreibung aus `packages/core/src/schema` ab (Plan Abschnitt 5).
 *
 * Seit Phase 4 zeigt es ausserdem die Befunde am Feld und nimmt Spruenge aus dem
 * Befund-Panel entgegen.
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

  if (!node || !spec) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyTitle>{t("inspektor.nichtsGewaehlt")}</EmptyTitle>
          <EmptyDescription>{t("inspektor.nichtsGewaehltText")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex flex-col gap-1 border-b border-border px-4 py-3">
        <nav aria-label="Pfad" className="flex flex-wrap items-center gap-1 text-2xs">
          {breadcrumb.map((entry, index) => (
            <span key={entry.nodeId} className="flex items-center gap-1">
              {index > 0 ? <span className="text-muted-foreground">/</span> : null}
              <button
                type="button"
                className="truncate text-muted-foreground hover:text-foreground"
                onClick={() => select(entry.nodeId)}
              >
                {entry.label}
              </button>
            </span>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <h2 className="truncate font-medium">
            {typeof node.data["idShort"] === "string" && node.data["idShort"]
              ? (node.data["idShort"] as string)
              : t("baum.ohneName")}
          </h2>
          <Badge variant="secondary">{node.kind}</Badge>
        </div>

        {typeof node.data["id"] === "string" ? (
          <p className="truncate font-mono text-2xs text-muted-foreground" title={node.data["id"]}>
            {shortenMiddle(node.data["id"], 60)}
          </p>
        ) : null}
      </header>

      <div className="flex-1 overflow-auto px-4 py-3">
        {spec.groups.map((group, index) => {
          const groupIssues = group.fields.reduce(
            (sum, field) => sum + (issuesByField.get(field.key)?.length ?? 0),
            0,
          );

          return (
            <section key={group.title}>
              {index > 0 ? <Separator className="my-4" /> : null}
              <Collapsible
                open={openGroups[group.title] ?? !group.collapsed}
                onOpenChange={(open) =>
                  setOpenGroups((current) => ({ ...current, [group.title]: open }))
                }
              >
                <CollapsibleTrigger className="group mb-2 flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <ChevronDown className="size-3.5 transition-transform group-data-[state=closed]:-rotate-90" />
                  {t(group.title)}
                  {groupIssues > 0 ? (
                    <span
                      data-numeric
                      className="rounded-xs bg-destructive-muted px-1 text-2xs text-destructive"
                    >
                      {groupIssues}
                    </span>
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
    </div>
  );
}
