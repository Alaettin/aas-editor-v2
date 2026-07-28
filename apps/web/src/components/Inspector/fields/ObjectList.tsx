import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { NESTED_SPECS, type FieldSpec, type JsonObject, type JsonValue } from "@aas-editor/core";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import type { FieldEditorProps } from "./Primitives";
import { ReferenceEditor } from "./Reference";
import { NestedFields } from "../NestedFields";

/**
 * Ein Editor fuer alle Listen eingebetteter Objekte: qualifiers, extensions,
 * specificAssetIds. Sie unterscheiden sich nur in ihrer Feldbeschreibung, deshalb gibt
 * es hier eine Implementierung statt dreier.
 */

export interface ObjectListProps extends FieldEditorProps {
  /** Schluessel in NESTED_SPECS, etwa "Qualifier" */
  readonly nested: string;
  /** Pflichtfelder eines neuen Eintrags */
  readonly template: JsonObject;
  /** Welches Feld die Zeile beschriftet */
  readonly labelKey: string;
}

export function ObjectListEditor({
  value,
  onChange,
  nested,
  template,
  labelKey,
}: ObjectListProps) {
  const { t } = useTranslation();
  const spec: readonly FieldSpec[] = NESTED_SPECS[nested] ?? [];
  const list = (Array.isArray(value) ? value : []) as JsonObject[];

  const replace = (next: JsonObject[]) =>
    onChange(next.length === 0 ? undefined : (next as unknown as JsonValue));

  return (
    <div className="flex flex-col gap-3">
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("inspektor.leer")}</p>
      ) : null}

      {list.map((entry, index) => (
        <div key={index} className="rounded-md border border-border p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="truncate text-xs font-medium">
              {typeof entry[labelKey] === "string" && entry[labelKey] !== ""
                ? (entry[labelKey] as string)
                : `${nested} ${index + 1}`}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto"
              aria-label={t("inspektor.entfernen")}
              onClick={() => replace(list.filter((_, i) => i !== index))}
            >
              <X />
            </Button>
          </div>

          <NestedFields
            spec={spec}
            data={entry}
            onChange={(key, next) => {
              const copy = [...list];
              const updated: JsonObject = { ...entry };
              if (next === undefined) delete updated[key];
              else updated[key] = next;
              copy[index] = updated;
              replace(copy);
            }}
          />
        </div>
      ))}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => replace([...list, { ...template }])}
        >
          <Plus data-icon="inline-start" />
          {t("inspektor.hinzufuegen")}
        </Button>
      </div>
    </div>
  );
}

/** Ein einzelnes eingebettetes Objekt: administration, assetInformation. */
export function NestedObjectEditor({
  value,
  onChange,
  nested,
  template,
  required,
}: FieldEditorProps & {
  readonly nested: string;
  readonly template: JsonObject;
  readonly required?: boolean;
}) {
  const { t } = useTranslation();
  const spec: readonly FieldSpec[] = NESTED_SPECS[nested] ?? [];
  const data =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as JsonObject)
      : null;

  if (!data) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange({ ...template })}
      >
        <Plus data-icon="inline-start" />
        {t("inspektor.hinzufuegen")}
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-border p-3">
      {required ? null : (
        <div className="mb-2 flex">
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
      )}
      <NestedFields
        spec={spec}
        data={data}
        onChange={(key, next) => {
          const updated: JsonObject = { ...data };
          if (next === undefined) delete updated[key];
          else updated[key] = next;
          onChange(updated);
        }}
      />
    </div>
  );
}

/**
 * EmbeddedDataSpecification-Liste. Bearbeitbar ist die `dataSpecification`-Referenz.
 * Der IEC-61360-Inhalt kommt laut Plan in Phase 5, das steht hier auch so.
 */
export function DataSpecificationListEditor({ value, onChange }: FieldEditorProps) {
  const { t } = useTranslation();
  const list = (Array.isArray(value) ? value : []) as JsonObject[];

  const replace = (next: JsonObject[]) =>
    onChange(next.length === 0 ? undefined : (next as unknown as JsonValue));

  return (
    <div className="flex flex-col gap-3">
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("inspektor.leer")}</p>
      ) : null}

      {list.map((entry, index) => (
        <div key={index} className="rounded-md border border-border p-3">
          <div className="mb-2 flex items-center">
            <span className="text-xs font-medium">EmbeddedDataSpecification {index + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto"
              aria-label={t("inspektor.entfernen")}
              onClick={() => replace(list.filter((_, i) => i !== index))}
            >
              <X />
            </Button>
          </div>

          <Field>
            <FieldLabel>dataSpecification</FieldLabel>
            <ReferenceEditor
              value={entry["dataSpecification"]}
              onChange={(next) => {
                const copy = [...list];
                copy[index] = { ...entry, dataSpecification: next as JsonValue };
                replace(copy);
              }}
            />
          </Field>

          <p className="mt-2 text-xs text-muted-foreground">{t("inspektor.phase5")}</p>
        </div>
      ))}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            replace([
              ...list,
              {
                dataSpecification: {
                  type: "ExternalReference",
                  keys: [{ type: "GlobalReference", value: "" }],
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
