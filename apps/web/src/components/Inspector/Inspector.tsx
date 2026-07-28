import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { specOf } from "@aas-editor/core";

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
 */
export function Inspector() {
  const { t } = useTranslation();
  const model = useEditor((state) => state.model);
  const selection = useEditor((state) => state.selection);
  const issues = useEditor((state) => state.issues);
  const updateField = useEditor((state) => state.updateField);
  const select = useEditor((state) => state.select);

  const node = model && selection ? model.nodes[selection] : undefined;
  const spec = node ? specOf(node.kind) : undefined;

  /** Welche Felder dieses Knotens hat die Validierung beanstandet. */
  const invalidFields = useMemo(() => {
    const set = new Set<string>();
    if (!selection) return set;
    for (const issue of issues) {
      if (issue.nodeId !== selection || issue.field === "") continue;
      set.add(issue.field.split(/[.[]/)[0] as string);
    }
    return set;
  }, [issues, selection]);

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
        {spec.groups.map((group, index) => (
          <section key={group.title}>
            {index > 0 ? <Separator className="my-4" /> : null}
            <Collapsible defaultOpen={!group.collapsed}>
              <CollapsibleTrigger className="group mb-2 flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                <ChevronDown className="size-3.5 transition-transform group-data-[state=closed]:-rotate-90" />
                {t(group.title)}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <FieldGroup className="gap-4">
                  {group.fields.map((field) => (
                    <FieldRenderer
                      key={field.key}
                      spec={field}
                      data={node.data}
                      invalid={invalidFields.has(field.key)}
                      onChange={(key, value) => updateField(node.nodeId, key, value)}
                    />
                  ))}
                </FieldGroup>
              </CollapsibleContent>
            </Collapsible>
          </section>
        ))}
      </div>
    </div>
  );
}
