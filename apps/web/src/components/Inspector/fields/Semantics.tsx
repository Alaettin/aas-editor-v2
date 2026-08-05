import { useTranslation } from "react-i18next";
import { BookOpen, Plus, X } from "lucide-react";
import { describeSemanticId, type JsonObject, type JsonValue } from "@aas-editor/core";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEditor } from "@/store/editor";
import { shortenMiddle } from "@/store/rows";
import type { FieldEditorProps } from "./Primitives";
import { ReferenceEditor } from "./Reference";
import { NestedFields } from "../NestedFields";

/**
 * Was der Editor ueber eine semanticId weiss, direkt unter dem Feld (Plan Abschnitt 11).
 *
 * Zeigt nur etwas, wenn die ConceptDescription in derselben Umgebung liegt. Tut sie das
 * nicht, ist das kein Fehler, sondern schlicht kein Zusatzwissen.
 */
export function SemanticHint({ reference }: { readonly reference: JsonValue | undefined }) {
  const { t } = useTranslation();
  const model = useEditor((state) => state.model);
  const goToNode = useEditor((state) => state.goToNode);

  const info = model ? describeSemanticId(model, reference) : null;
  if (!info) return null;

  return (
    <div className="mt-1 flex flex-col gap-0.5 rounded-md bg-muted/60 px-2 py-1.5 text-xs">
      <div className="flex items-center gap-1.5">
        <BookOpen className="size-3 shrink-0 text-muted-foreground" />
        <span className="font-medium">{info.preferredName ?? t("semantik.ohneNamen")}</span>
        {info.unit ? <span className="text-muted-foreground">[{info.unit}]</span> : null}
        {info.dataType ? (
          <Chip tone="cd" mono>
            {info.dataType}
          </Chip>
        ) : null}
        <button
          type="button"
          className="ml-auto shrink-0 text-2xs text-muted-foreground underline underline-offset-2"
          onClick={() => goToNode(info.conceptDescription.nodeId)}
        >
          {t("semantik.zurDefinition")}
        </button>
      </div>
      {info.definition ? (
        <p className="text-2xs text-muted-foreground">{info.definition}</p>
      ) : null}
    </div>
  );
}

/**
 * Das Wertfeld einer Property.
 *
 * Gibt es in der zugehoerigen ConceptDescription eine `valueList`, wird daraus eine
 * Auswahl, und die passende `valueId` wird mitgesetzt (Constraint AASd-007). Fehlt die
 * Liste, bleibt es Freitext, so wie es der Plan vorsieht.
 */
export function ValueWithChoices({
  value,
  onChange,
  onValueIdChange,
  semanticId,
  id,
  invalid,
  fallback,
}: FieldEditorProps & {
  readonly onValueIdChange: (valueId: JsonValue | undefined) => void;
  readonly semanticId: JsonValue | undefined;
  /** Das gewoehnliche Textfeld, wenn es keine Auswahl gibt */
  readonly fallback: React.ReactNode;
}) {
  const { t } = useTranslation();
  const model = useEditor((state) => state.model);

  const info = model ? describeSemanticId(model, semanticId) : null;
  const choices = info?.choices ?? [];
  if (choices.length === 0) return <>{fallback}</>;

  const aktuell = typeof value === "string" ? value : "";

  return (
    <div className="flex flex-col gap-1">
      <Select
        value={aktuell === "" ? undefined : aktuell}
        onValueChange={(next) => {
          onChange(next);
          const treffer = choices.find((choice) => choice.value === next);
          onValueIdChange(treffer?.valueId ?? undefined);
        }}
      >
        <SelectTrigger id={id} aria-invalid={invalid} className="w-full" data-value-choices>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectGroup>
            {choices.map((choice) => (
              <SelectItem key={choice.value} value={choice.value}>
                {choice.value}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <p className="text-2xs text-muted-foreground">
        {t("semantik.ausValueList", { count: choices.length })}
      </p>
    </div>
  );
}

/** Die valueList einer DataSpecificationIec61360: Wertepaare aus Wert und valueId. */
export function ValueListEditor({ value, onChange }: FieldEditorProps) {
  const { t } = useTranslation();
  const liste =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as JsonObject)
      : null;
  const paare = Array.isArray(liste?.["valueReferencePairs"])
    ? (liste["valueReferencePairs"] as JsonObject[])
    : [];

  const schreiben = (next: JsonObject[]) =>
    onChange(next.length === 0 ? undefined : ({ valueReferencePairs: next } as JsonValue));

  return (
    <div className="flex flex-col gap-2">
      {paare.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("inspektor.leer")}</p>
      ) : null}

      {paare.map((paar, index) => (
        <div key={index} className="rounded-md border border-border p-2">
          <div className="mb-2 flex items-center gap-2">
            <Input
              aria-label={t("semantik.wert")}
              placeholder={t("semantik.wert")}
              value={typeof paar["value"] === "string" ? paar["value"] : ""}
              onChange={(event) => {
                const next = [...paare];
                next[index] = { ...paar, value: event.target.value };
                schreiben(next);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("inspektor.entfernen")}
              onClick={() => schreiben(paare.filter((_, i) => i !== index))}
            >
              <X />
            </Button>
          </div>
          <ReferenceEditor
            value={paar["valueId"]}
            onChange={(next) => {
              const copy = [...paare];
              const updated: JsonObject = { ...paar };
              if (next === undefined) delete updated["valueId"];
              else updated["valueId"] = next;
              copy[index] = updated;
              schreiben(copy);
            }}
          />
        </div>
      ))}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            schreiben([
              ...paare,
              {
                value: "",
                valueId: {
                  type: "ExternalReference",
                  keys: [{ type: "GlobalReference", value: "" }],
                },
              },
            ])
          }
        >
          <Plus data-icon="inline-start" />
          {t("inspektor.hinzufuegen")}
        </Button>
      </div>
    </div>
  );
}

/** LevelType: vier Flaggen min, nom, typ, max. */
export function LevelTypeEditor({ value, onChange }: FieldEditorProps) {
  const { t } = useTranslation();
  const flaggen =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as JsonObject)
      : null;

  if (!flaggen) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange({ min: false, nom: false, typ: false, max: false })}
      >
        <Plus data-icon="inline-start" />
        {t("inspektor.hinzufuegen")}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-md border border-border px-3 py-2">
      {(["min", "nom", "typ", "max"] as const).map((flagge) => (
        <label key={flagge} className="flex items-center gap-1.5 text-xs">
          <Checkbox
            checked={flaggen[flagge] === true}
            onCheckedChange={(checked) => onChange({ ...flaggen, [flagge]: checked === true })}
          />
          {flagge}
        </label>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="ml-auto"
        aria-label={t("inspektor.entfernen")}
        onClick={() => onChange(undefined)}
      >
        <X />
      </Button>
    </div>
  );
}

/**
 * Die EmbeddedDataSpecification-Liste, jetzt mit vollstaendigem IEC-61360-Inhalt.
 * In Phase 4 stand hier nur die Referenz, der Rest war auf Phase 5 vertagt.
 */
export function DataSpecificationEditor({ value, onChange }: FieldEditorProps) {
  const { t } = useTranslation();
  const liste = (Array.isArray(value) ? value : []) as JsonObject[];

  const schreiben = (next: JsonObject[]) =>
    onChange(next.length === 0 ? undefined : (next as unknown as JsonValue));

  return (
    <div className="flex flex-col gap-3">
      {liste.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("inspektor.leer")}</p>
      ) : null}

      {liste.map((eintrag, index) => {
        const inhalt =
          typeof eintrag["dataSpecificationContent"] === "object" &&
          eintrag["dataSpecificationContent"] !== null &&
          !Array.isArray(eintrag["dataSpecificationContent"])
            ? (eintrag["dataSpecificationContent"] as JsonObject)
            : null;
        const istIec = inhalt?.["modelType"] === "DataSpecificationIec61360";

        return (
          <div key={index} className="rounded-md border border-border p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-medium">
                {istIec ? "DataSpecificationIec61360" : t("semantik.andereSpezifikation")}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto"
                aria-label={t("inspektor.entfernen")}
                onClick={() => schreiben(liste.filter((_, i) => i !== index))}
              >
                <X />
              </Button>
            </div>

            <p className="mb-1 text-2xs text-muted-foreground">
              dataSpecification:{" "}
              <span className="font-mono">
                {shortenMiddle(referenceLabel(eintrag["dataSpecification"]), 40)}
              </span>
            </p>
            <ReferenceEditor
              value={eintrag["dataSpecification"]}
              onChange={(next) => {
                const copy = [...liste];
                copy[index] = { ...eintrag, dataSpecification: next as JsonValue };
                schreiben(copy);
              }}
            />

            {istIec && inhalt ? (
              <div className="mt-3 border-t border-border pt-3">
                <NestedFields
                  nested="DataSpecificationIec61360"
                  data={inhalt}
                  onChange={(key, next) => {
                    const copy = [...liste];
                    const updated: JsonObject = { ...inhalt };
                    if (next === undefined) delete updated[key];
                    else updated[key] = next;
                    copy[index] = { ...eintrag, dataSpecificationContent: updated };
                    schreiben(copy);
                  }}
                />
              </div>
            ) : null}
          </div>
        );
      })}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            schreiben([
              ...liste,
              {
                dataSpecification: {
                  type: "ExternalReference",
                  keys: [
                    {
                      type: "GlobalReference",
                      value:
                        "https://admin-shell.io/DataSpecificationTemplates/DataSpecificationIec61360/3/0",
                    },
                  ],
                },
                dataSpecificationContent: {
                  modelType: "DataSpecificationIec61360",
                  preferredName: [{ language: "de", text: "" }],
                },
              },
            ])
          }
        >
          <Plus data-icon="inline-start" />
          {t("inspektor.hinzufuegen")}
        </Button>
      </div>
    </div>
  );
}

function referenceLabel(reference: JsonValue | undefined): string {
  if (typeof reference !== "object" || reference === null || Array.isArray(reference)) return "—";
  const keys = (reference as JsonObject)["keys"];
  if (!Array.isArray(keys) || keys.length === 0) return "—";
  const first = keys[0] as JsonObject;
  const value = first?.["value"];
  return typeof value === "string" && value ? value : "—";
}
