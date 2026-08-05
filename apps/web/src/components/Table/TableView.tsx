import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Columns3, Copy, Plus, Trash2 } from "lucide-react";
import {
  canContain,
  childSlotsOf,
  isJsonObject,
  SUBMODEL_ELEMENT_KINDS,
  type EditorNode,
  type JsonValue,
  type NodeId,
} from "@aas-editor/core";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/section-label";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { badgeToneOf, shortKind } from "@/lib/typeOf";
import { useElementWidth } from "@/lib/useElementWidth";
import { cn } from "@/lib/utils";
import { useEditor } from "@/store/editor";
import { shortenMiddle } from "@/store/rows";
import { inEingabefeld } from "@/lib/shortcuts";

/**
 * Tabellensicht fuer Massenbearbeitung (Plan Abschnitt 8).
 *
 * Gezeigt werden die Kinder des gewaehlten Behaelters. Ist etwas anderes gewaehlt, wird
 * der naechste Behaelter darueber genommen, damit die Sicht nie leer wirkt.
 *
 * Aufbau als CSS-Grid statt als `<table>`: klebender Kopf, `fr`-Spalten, Zeilentoenung
 * ueber die volle Breite und der Spaltenkollaps sind damit geradeaus. Die Rollen bleiben
 * gesetzt, fuer Vorleseprogramme ist es weiterhin eine Tabelle.
 *
 * Jede Aenderung laeuft durch dieselben Store-Aktionen wie Baum und Formular, also durch
 * `applyChange`, Undo und den Patch-Kanal zum Worker. Es gibt keinen zweiten Weg ins
 * Modell.
 */

interface Zeile {
  readonly node: EditorNode;
  readonly index: number;
}

type SpaltenId = "idShort" | "modelType" | "valueType" | "value" | "semanticId";

const ALLE_SPALTEN: readonly SpaltenId[] = [
  "idShort",
  "modelType",
  "valueType",
  "value",
  "semanticId",
];

/** Spaltenmasse aus dem Mockup, je Spalte eine Grid-Spur. */
const SPALTENMASS: Record<SpaltenId, string> = {
  idShort: "1.4fr",
  modelType: "150px",
  valueType: "90px",
  value: "1.3fr",
  semanticId: "1.1fr",
};

/**
 * Unter dieser Breite fallen valueType und semanticId weg. Genau der Fall, den das Mockup
 * fuer den geoeffneten Assistenten zeigt, hier aber allgemein: schmales Fenster, breiter
 * Explorer oder offenes Befundpanel fuehren zu demselben Platzmangel.
 */
const SCHMAL = 720;

export default function TableView() {
  const { t } = useTranslation();
  const model = useEditor((state) => state.model);
  const selection = useEditor((state) => state.selection);
  const issues = useEditor((state) => state.issues);
  const select = useEditor((state) => state.select);
  const setView = useEditor((state) => state.setView);
  const updateField = useEditor((state) => state.updateField);
  const addElement = useEditor((state) => state.addElement);
  const requestDelete = useEditor((state) => state.requestDelete);
  const duplicateElement = useEditor((state) => state.duplicateElement);

  const flaecheRef = useRef<HTMLDivElement>(null);
  const breite = useElementWidth(flaecheRef);

  const [markiert, setMarkiert] = useState<Record<NodeId, true>>({});
  const [sichtbar, setSichtbar] = useState<Record<SpaltenId, boolean>>({
    idShort: true,
    modelType: true,
    valueType: true,
    value: true,
    semanticId: true,
  });

  /** Der Behaelter, dessen Kinder die Tabelle zeigt. */
  const behaelter = useMemo(() => {
    if (!model || !selection) return null;
    let current: NodeId | null = selection;
    while (current) {
      const node: EditorNode | undefined = model.nodes[current];
      if (!node) break;
      if (childSlotsOf(node.kind).length > 0 && node.kind !== "Environment") return node;
      current = node.parent;
    }
    return null;
  }, [model, selection]);

  const slot = useMemo(() => {
    if (!behaelter) return null;
    const slots = childSlotsOf(behaelter.kind);
    return (
      slots.find((entry) => (behaelter.children[entry.name]?.length ?? 0) > 0) ?? slots[0] ?? null
    );
  }, [behaelter]);

  const zeilen = useMemo<Zeile[]>(() => {
    if (!model || !behaelter || !slot) return [];
    return (behaelter.children[slot.name] ?? [])
      .map((id, index) => ({ node: model.nodes[id], index }))
      .filter((eintrag): eintrag is Zeile => eintrag.node !== undefined);
  }, [model, behaelter, slot]);

  /** Befunde je Knoten: Zahl und die erste Constraint-Kennung fuer den Chip. */
  const befunde = useMemo(() => {
    const map = new Map<NodeId, { anzahl: number; regel: string | null }>();
    for (const issue of issues) {
      if (!issue.nodeId) continue;
      const eintrag = map.get(issue.nodeId) ?? { anzahl: 0, regel: null };
      eintrag.anzahl += 1;
      if (eintrag.regel === null && issue.constraintId) eintrag.regel = issue.constraintId;
      map.set(issue.nodeId, eintrag);
    }
    return map;
  }, [issues]);

  const markierte = Object.keys(markiert).filter((id) => zeilen.some((z) => z.node.nodeId === id));

  const spalten = ALLE_SPALTEN.filter((id) => {
    if (!sichtbar[id]) return false;
    if (breite > 0 && breite < SCHMAL && (id === "valueType" || id === "semanticId")) return false;
    return true;
  });
  const gridVorlage = ["32px", ...spalten.map((id) => SPALTENMASS[id])].join(" ");

  if (!behaelter || !slot) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyTitle>{t("tabelle.keinBehaelter")}</EmptyTitle>
          <EmptyDescription>{t("tabelle.keinBehaelterText")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const erlaubteTypen =
    behaelter.kind === "Environment"
      ? []
      : SUBMODEL_ELEMENT_KINDS.filter((kind) =>
          canContain(behaelter.kind, slot.name, kind, behaelter.data),
        );

  const mitBefund = zeilen.filter((zeile) => befunde.has(zeile.node.nodeId)).length;
  const position = zeilen.findIndex((zeile) => zeile.node.nodeId === selection);

  return (
    <div ref={flaecheRef} className="flex h-full flex-col overflow-hidden bg-card">
      <header className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-2.5">
        <span className="truncate text-lg font-semibold">
          {typeof behaelter.data["idShort"] === "string" && behaelter.data["idShort"]
            ? (behaelter.data["idShort"] as string)
            : behaelter.kind}
        </span>
        <Chip tone="sm" mono>
          {slot.name}
        </Chip>
        <span className="text-sm text-muted-foreground" data-numeric>
          {t("tabelle.eintraege", { count: zeilen.length })}
          {mitBefund > 0 ? ` · ${t("tabelle.mitBefund", { count: mitBefund })}` : ""}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          {markierte.length > 0 ? (
            <>
              <span className="text-2xs text-muted-foreground" data-numeric>
                {t("tabelle.markiert", { count: markierte.length })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  for (const id of markierte) duplicateElement(id);
                  setMarkiert({});
                }}
              >
                <Copy data-icon="inline-start" />
                {t("baum.duplizieren")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // Ueber denselben Dialog wie im Baum. Vorher loeschte die Tabelle die
                  // Markierung ohne jede Rueckfrage.
                  requestDelete(markierte);
                  setMarkiert({});
                }}
              >
                <Trash2 data-icon="inline-start" />
                {t("baum.loeschen")}
              </Button>
            </>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 data-icon="inline-start" />
                {t("tabelle.spalten")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ALLE_SPALTEN.map((id) => (
                <DropdownMenuCheckboxItem
                  key={id}
                  checked={sichtbar[id]}
                  disabled={id === "idShort"}
                  onCheckedChange={(an) => setSichtbar((current) => ({ ...current, [id]: an }))}
                >
                  {t(`tabelle.spalte.${id}`)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" disabled={erlaubteTypen.length === 0}>
                <Plus data-icon="inline-start" />
                {t("baum.neu")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-auto">
              <DropdownMenuGroup>
                {erlaubteTypen.map((kind) => (
                  <DropdownMenuItem
                    key={kind}
                    onSelect={() => addElement(behaelter.nodeId, slot.name, kind)}
                  >
                    {kind}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/*
        Enter oeffnet das Formular. Die Fusszeile verspricht das, also muss es hier stehen
        und nicht nur im Baum.
      */}
      <div
        role="table"
        // Die Kopfzeile zaehlt mit, sonst passen `aria-rowcount` und `aria-rowindex`
        // nicht zusammen. Die Spaltenzahl schwankt mit der Fensterbreite, genau dafuer
        // gibt es `aria-colcount`.
        aria-rowcount={zeilen.length + 1}
        aria-colcount={spalten.length + 1}
        tabIndex={0}
        onKeyDown={(event) => {
          // In einer Zelle gehoeren die Tasten der Eingabe, nicht der Tabelle.
          if (inEingabefeld(event.target)) return;

          if (event.key === "Enter" && selection) {
            event.preventDefault();
            setView("formular");
            return;
          }

          // Pfeiltasten wie im Baum. Vorher liess sich die Zeile nur mit der Maus
          // wechseln, obwohl die Fusszeile Enter als Weg ins Formular verspricht.
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          if (zeilen.length === 0) return;
          const jetzt = zeilen.findIndex((z) => z.node.nodeId === selection);
          const ziel =
            jetzt < 0
              ? 0
              : Math.min(
                  Math.max(jetzt + (event.key === "ArrowDown" ? 1 : -1), 0),
                  zeilen.length - 1,
                );
          const naechste = zeilen[ziel];
          if (naechste) select(naechste.node.nodeId);
        }}
        className="flex-1 overflow-auto outline-none"
      >
        <div
          role="row"
          aria-rowindex={1}
          style={{ gridTemplateColumns: gridVorlage }}
          className="sticky top-0 z-10 grid h-(--table-header-height) items-center gap-3 border-b border-border bg-muted px-4"
        >
          <span role="columnheader" aria-colindex={1} />
          {spalten.map((id, spalte) => (
            <SectionLabel
              key={id}
              role="columnheader"
              aria-colindex={spalte + 2}
              data-col={id}
              className="tracking-[0.05em]"
            >
              {t(`tabelle.spalte.${id}`)}
            </SectionLabel>
          ))}
        </div>

        {zeilen.map((zeile, index) => {
          const node = zeile.node;
          const befund = befunde.get(node.nodeId);
          const gewaehlt = node.nodeId === selection;
          const semantic = semanticIdText(node.data["semanticId"]);

          return (
            <div
              key={node.nodeId}
              role="row"
              aria-rowindex={index + 2}
              data-table-row={node.nodeId}
              onClick={() => select(node.nodeId)}
              style={{ gridTemplateColumns: gridVorlage }}
              className={cn(
                "grid h-(--table-row-height) items-center gap-3 border-b border-border-row px-4",
                gewaehlt
                  ? "bg-selected shadow-[inset_3px_0_0_var(--primary)]"
                  : befund
                    ? "bg-warning-muted hover:bg-accent"
                    : "hover:bg-accent",
              )}
            >
              <span role="cell" aria-colindex={1}>
                <Checkbox
                  checked={Boolean(markiert[node.nodeId])}
                  aria-label={t("tabelle.markieren")}
                  onCheckedChange={(checked) =>
                    setMarkiert((current) => {
                      const next = { ...current };
                      if (checked === true) next[node.nodeId] = true;
                      else delete next[node.nodeId];
                      return next;
                    })
                  }
                />
              </span>

              {spalten.includes("idShort") ? (
                <span
                  role="cell"
                  aria-colindex={spalten.indexOf("idShort") + 2}
                  data-col="idShort"
                  className="flex min-w-0 items-center gap-2"
                >
                  <ZelleText
                    node={node}
                    feld="idShort"
                    onChange={(wert) => updateField(node.nodeId, "idShort", wert)}
                  />
                  {befund?.regel ? (
                    <Chip tone="warn" fill="solid" pill mono className="shrink-0">
                      {befund.regel}
                    </Chip>
                  ) : null}
                </span>
              ) : null}

              {spalten.includes("modelType") ? (
                <span
                  role="cell"
                  aria-colindex={spalten.indexOf("modelType") + 2}
                  data-col="modelType"
                >
                  <Chip tone={badgeToneOf(node.kind)} mono>
                    {shortKind(node.kind)}
                  </Chip>
                </span>
              ) : null}

              {spalten.includes("valueType") ? (
                <span
                  role="cell"
                  aria-colindex={spalten.indexOf("valueType") + 2}
                  data-col="valueType"
                  className="truncate font-mono text-xs text-mono-foreground"
                >
                  {typeof node.data["valueType"] === "string" ? (
                    (node.data["valueType"] as string)
                  ) : (
                    <span className="text-foreground-faint">—</span>
                  )}
                </span>
              ) : null}

              {spalten.includes("value") ? (
                <span
                  role="cell"
                  aria-colindex={spalten.indexOf("value") + 2}
                  data-col="value"
                  className="min-w-0"
                >
                  <ZelleText
                    node={node}
                    feld="value"
                    onChange={(wert) => updateField(node.nodeId, "value", wert)}
                  />
                </span>
              ) : null}

              {spalten.includes("semanticId") ? (
                <span
                  role="cell"
                  aria-colindex={spalten.indexOf("semanticId") + 2}
                  data-col="semanticId"
                  title={semantic ?? undefined}
                  className="truncate font-mono text-xs text-foreground-faint"
                >
                  {semantic ? shortenMiddle(semantic, 30) : "—"}
                </span>
              ) : null}
            </div>
          );
        })}

        {zeilen.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">{t("tabelle.leer")}</p>
        ) : null}
      </div>

      <footer className="flex shrink-0 items-center gap-3 border-t border-border bg-muted px-4 py-2 text-xs text-muted-foreground">
        {markierte.length > 0 ? (
          <span className="font-semibold text-selected-foreground" data-numeric>
            {t("tabelle.markiert", { count: markierte.length })}
          </span>
        ) : null}
        <span>{t("tabelle.enterOeffnet")}</span>
        {position >= 0 ? (
          <span className="ml-auto" data-numeric>
            {t("tabelle.zeileVon", { zeile: position + 1, gesamt: zeilen.length })}
          </span>
        ) : null}
      </footer>
    </div>
  );
}

/**
 * Eine bearbeitbare Zelle. Haelt waehrend des Tippens einen lokalen Zustand und meldet
 * erst beim Verlassen nach oben, genau wie das Formular. Sonst erzeugte jeder Tastendruck
 * einen Patch und eine Worker-Nachricht.
 */
function ZelleText({
  node,
  feld,
  onChange,
}: {
  readonly node: EditorNode;
  readonly feld: string;
  readonly onChange: (wert: JsonValue | undefined) => void;
}) {
  const { t } = useTranslation();
  const wert = node.data[feld];
  const text = typeof wert === "string" ? wert : "";
  const [entwurf, setEntwurf] = useState(text);

  // Aenderungen von aussen (Undo, Formular, Auswahlwechsel) uebernehmen.
  useEffect(() => setEntwurf(text), [text]);

  // Sprachtexte, Listen und Objekte lassen sich in einer Zelle nicht sinnvoll bearbeiten.
  if (wert !== undefined && typeof wert !== "string") {
    return <span className="text-2xs text-muted-foreground">{t("tabelle.imFormular")}</span>;
  }

  return (
    <Input
      variant="bare"
      // Ohne Beschriftung ist das Feld in einer Zelle namenlos: der Spaltenkopf gilt
      // fuer die Zelle, nicht fuer das Bedienelement darin.
      aria-label={t(`tabelle.spalte.${feld}`)}
      data-table-cell={feld}
      value={entwurf}
      onChange={(event) => setEntwurf(event.target.value)}
      onBlur={() => {
        if (entwurf !== text) onChange(entwurf === "" ? undefined : entwurf);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setEntwurf(text);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function semanticIdText(reference: JsonValue | undefined): string | null {
  if (!isJsonObject(reference)) return null;
  const keys = reference["keys"];
  if (!Array.isArray(keys) || keys.length === 0) return null;
  const first = keys[0];
  if (!isJsonObject(first)) return null;
  const wert = first["value"];
  return typeof wert === "string" && wert ? wert : null;
}
