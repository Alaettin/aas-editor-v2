import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Trash2 } from "lucide-react";
import { specOf } from "@aas-editor/core";
import { topLevelField, type ValidationIssue } from "@aas-editor/core/validation";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { FieldGroup } from "@/components/ui/field";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { SectionLabel } from "@/components/ui/section-label";
import { toneOf } from "@/lib/typeOf";
import { useEditor } from "@/store/editor";
import { pathTo } from "@/store/rows";
import { ConceptCard } from "./ConceptCard";
import { ContextCard } from "./ContextCard";
import { FieldRenderer } from "./FieldRenderer";
import { Medien } from "./Medien";

/**
 * Das Eigenschaftsformular. Es rendert nichts Typspezifisches selbst, sondern arbeitet
 * die Typbeschreibung aus `packages/core/src/schema` ab (Plan Abschnitt 5).
 *
 * Zwei Flaechen, verschiebbar, je zur Haelfte: links die bearbeitbaren Gruppen als Karten,
 * darunter die Herkunft der Bedeutung (ConceptDescription) und der Ort im Modell; rechts
 * die Dateien des gewaehlten Teilbaums.
 *
 * Die Aufteilung hat einen Grund: eine AAS besteht zu einem guten Teil aus Datenblaettern,
 * Logos und Vorschaubildern, und die waren im Editor bisher ueberhaupt nicht zu sehen. Ein
 * File-Element zeigte nur seinen Pfad.
 */

/** Welche Gruppen ohne Zutun offen stehen: die erste und WERT. */
function istVorgabe(titel: string, index: number): boolean {
  return index === 0 || titel === "gruppe.wert";
}

export function Inspector() {
  const { t } = useTranslation();
  const model = useEditor((state) => state.model);
  const selection = useEditor((state) => state.selection);
  const issues = useEditor((state) => state.issues);
  const focusRequest = useEditor((state) => state.focusRequest);
  const updateField = useEditor((state) => state.updateField);
  const clearFocusRequest = useEditor((state) => state.clearFocusRequest);
  const select = useEditor((state) => state.select);
  const requestDelete = useEditor((state) => state.requestDelete);
  const issuePanelOpen = useEditor((state) => state.issuePanelOpen);
  const setIssuePanelOpen = useEditor((state) => state.setIssuePanelOpen);

  const node = model && selection ? model.nodes[selection] : undefined;
  const spec = node ? specOf(node.kind) : undefined;

  /** Welche Gruppen sind aufgeklappt. Gesteuert, damit ein Sprung sie oeffnen kann. */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  /**
   * Ob eine Gruppe offen ist. **Eine** Stelle, an der die Vorgabe steht: sie wird an drei
   * Orten gebraucht (Zuruecksetzen beim Elementwechsel, der Umschalter, das Rendern), und
   * drei Kopien derselben Regel laufen frueher oder spaeter auseinander.
   *
   * Vorgabe sind die **erste** Gruppe und WERT, der Rest zu. WERT ist bei einer Property
   * das, weswegen man das Element ueberhaupt geoeffnet hat, steht aber nie an erster
   * Stelle. Verglichen wird der i18n-Schluessel, nicht die Beschriftung: der Titel in
   * `FieldGroupSpec` ist bereits einer, und die Regel darf nicht an der Sprache haengen.
   *
   * Der Rueckfall ist noetig, weil `openGroups` vor dem ersten Lauf des Effekts leer ist;
   * ohne ihn stuende im ersten Bild alles zugeklappt und klappte danach auf.
   */
  const istOffen = (titel: string, index: number): boolean =>
    openGroups[titel] ?? istVorgabe(titel, index);

  // Beim Wechsel des Elements steht wieder die Vorgabe.
  useEffect(() => {
    if (!spec) return;
    const next: Record<string, boolean> = {};
    spec.groups.forEach((group, index) => {
      next[group.title] = istVorgabe(group.title, index);
    });
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

  // Umschalter fuer alle Gruppen, nach dem Muster aus dem Baumkopf: sind alle offen,
  // klappt der Knopf zu, sonst auf.
  const alleOffen = spec.groups.every((group, index) => istOffen(group.title, index));
  const gruppenUmschalten = () => {
    const naechste: Record<string, boolean> = {};
    for (const group of spec.groups) naechste[group.title] = !alleOffen;
    setOpenGroups(naechste);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="shrink-0 px-7 pt-3.5">
        <nav aria-label={t("baum.pfad")} className="flex flex-wrap items-center gap-1 text-xs">
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
        </div>

      </header>

      {/*
       * Zwei Flaechen, verschiebbar. **Nur die linke traegt eine Vorgabe**: Vorgaben in
       * einer Gruppe normieren sich gegeneinander, zwei davon ergeben nicht 50 zu 50.
       * Beide Werte sind Prozente, Pixel kommen in dieser Gruppe nicht vor.
       */}
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="50" minSize="25">
          <div className="flex h-full flex-col">
            {/*
             * Die Knoepfe wirken auf das **Formular**, nicht auf die Dateiflaeche. Sie
             * standen bis zum 10.08.2026 im Kopf ueber der vollen Breite und schwebten
             * dadurch ueber den Dateien. Hier stehen sie ueber der linken Flaeche und
             * ausserhalb des Rollbereichs, bleiben beim Blaettern also stehen.
             *
             * Die Varianten sind die der Projektseite (`Detailleiste.tsx`): derselbe
             * Knopf soll in beiden Ansichten gleich aussehen.
             */}
            <div className="flex shrink-0 items-center gap-2 px-7 pt-3.5">
              <Button variant="outline" onClick={gruppenUmschalten}>
                {alleOffen ? (
                  <ChevronsDownUp data-icon="inline-start" />
                ) : (
                  <ChevronsUpDown data-icon="inline-start" />
                )}
                {alleOffen ? t("menu.allesZuklappen") : t("menu.allesAufklappen")}
              </Button>
              {/* Duplizieren steht in der Werkzeugleiste oben, ein zweites Mal braucht
                  es den Knopf hier nicht. */}
              <Button
                variant="destructive"
                disabled={istWurzel}
                onClick={() => requestDelete([node.nodeId])}
              >
                <Trash2 data-icon="inline-start" />
                {t("menu.loeschen")}
              </Button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-7 py-4">
              {/*
               * Die Karten behalten ihre Breite, auch wenn die Flaeche waechst: ein
               * Eingabefeld ueber die halbe Bildschirmbreite liest sich nicht besser.
               */}
              <div className="flex w-full max-w-[640px] flex-col gap-3.5">
          {spec.groups.map((group, index) => {
            /*
             * Veraltetes bleibt weg, solange es leer ist. Gefiltert wird hier und nicht im
             * FieldRenderer: sonst bliebe eine leere Gruppe samt Befundzaehler stehen.
             * Traegt das Feld einen Wert, bleibt es sichtbar, sonst schriebe der Editor
             * still etwas mit, das niemand mehr sehen oder loeschen kann.
             */
            const felder = group.fields.filter(
              (field) =>
                field.deprecated !== true ||
                (node.data[field.key] !== undefined && node.data[field.key] !== ""),
            );
            if (felder.length === 0) return null;

            const groupIssues = felder.reduce(
              (sum, field) => sum + (issuesByField.get(field.key)?.length ?? 0),
              0,
            );

            return (
              <section
                key={group.title}
                className="rounded-4xl border border-border bg-card px-4.5 py-4"
              >
                <Collapsible
                  open={istOffen(group.title, index)}
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
                      {felder.map((field) => (
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

              {/*
               * Herkunft der Bedeutung und Ort im Modell, unter den Gruppen. Sie standen
               * bis zum 10.08.2026 rechts; dort steht jetzt, was eine AAS wirklich
               * ausmacht, naemlich ihre Dateien.
               */}
              <ConceptCard model={model} node={node} />
              <ContextCard model={model} node={node} />
              </div>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Ohne eigene Vorgabe: diese Flaeche bekommt, was die linke uebrig laesst. */}
        <ResizablePanel minSize="25">
          <div className="h-full border-l border-border">
            <Medien model={model} node={node} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

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
