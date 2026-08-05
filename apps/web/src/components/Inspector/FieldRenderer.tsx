import { useTranslation } from "react-i18next";
import { ENUMS, type FieldSpec, type JsonObject, type JsonValue } from "@aas-editor/core";
import type { ValidationIssue } from "@aas-editor/core/validation";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { IssueText } from "@/components/Issues/IssueText";
import { EnumEditor, TextEditor } from "./fields/Primitives";
import { LangStringsEditor } from "./fields/LangStrings";
import { ReferenceEditor, ReferenceListEditor } from "./fields/Reference";
import { NestedObjectEditor, ObjectListEditor } from "./fields/ObjectList";
import { AttachmentEditor, BlobEditor } from "./fields/Attachment";
import { BooleanEditor } from "./fields/Primitives";
import {
  DataSpecificationEditor,
  LevelTypeEditor,
  SemanticHint,
  ValueListEditor,
  ValueWithChoices,
} from "./fields/Semantics";

/**
 * Der generische Renderer: eine Feldbeschreibung hinein, das passende Eingabefeld
 * heraus. Ein neuer Feldtyp im Metamodell braucht hier einen Zweig, nicht 14 neue
 * Formulare.
 */

/**
 * Feldarten, die genau **ein** Bedienelement zeigen. Nur dort darf die Beschriftung
 * ueber `htmlFor` auf eine Kennung zeigen.
 *
 * Alle uebrigen sind zusammengesetzt: Listen, Gruppen, ganze Unterformulare. Ihre
 * Beschriftung zeigte bisher ins Leere, weil die Kennung nirgends ankam. Sie bekommen
 * stattdessen eine Gruppe, die sich auf die Beschriftung beruft. Das ist der Weg, den
 * ARIA dafuer vorsieht, und er haelt auch dann, wenn die Liste leer ist.
 */
const EINZELFELD = new Set(["text", "textarea", "enum", "boolean", "attachment"]);

export interface FieldRendererProps {
  readonly spec: FieldSpec;
  /** Die Daten des umgebenden Objekts, fuer `typedBy` */
  readonly data: JsonObject;
  readonly onChange: (key: string, value: JsonValue | undefined) => void;
  /** Befunde, die genau an diesem Feld haengen */
  readonly issues?: readonly ValidationIssue[];
}

export function FieldRenderer({ spec, data, onChange, issues }: FieldRendererProps) {
  const { t } = useTranslation();
  const value = data[spec.key];
  const set = (next: JsonValue | undefined) => onChange(spec.key, next);
  const id = `feld-${spec.key}`;

  const constraints = issues?.filter((issue) => issue.severity === "constraint") ?? [];
  const warnings = issues?.filter((issue) => issue.severity === "warnung") ?? [];
  const invalid = constraints.length > 0;

  const einzeln = EINZELFELD.has(spec.kind);
  const rohesFeld = renderControl(spec, value, data, set, invalid, id, onChange);
  const control = einzeln ? (
    rohesFeld
  ) : (
    <div role="group" aria-labelledby={`${id}-label`}>
      {rohesFeld}
    </div>
  );
  const orientation = spec.kind === "boolean" ? "horizontal" : "vertical";

  return (
    <Field data-invalid={invalid || undefined} data-field-key={spec.key} orientation={orientation}>
      <FieldLabel id={`${id}-label`} {...(einzeln ? { htmlFor: id } : {})}>
        {spec.key}
        {spec.required ? <span className="text-destructive"> *</span> : null}
      </FieldLabel>
      {control}

      {constraints.length > 0 ? (
        <FieldError>
          <div className="flex flex-col gap-1">
            {constraints.map((issue, index) => (
              <IssueText key={index} issue={issue} />
            ))}
          </div>
        </FieldError>
      ) : null}

      {warnings.map((issue, index) => (
        <FieldDescription key={index} className="text-warning">
          <IssueText issue={issue} />
        </FieldDescription>
      ))}

      {spec.hint ? <FieldDescription>{t(spec.hint)}</FieldDescription> : null}

      {/* Was die semanticId ueber dieses Element verraet, sofern die CD greifbar ist. */}
      {spec.key === "semanticId" ? <SemanticHint reference={value} /> : null}
    </Field>
  );
}

function renderControl(
  spec: FieldSpec,
  value: JsonValue | undefined,
  data: JsonObject,
  set: (next: JsonValue | undefined) => void,
  invalid: boolean | undefined,
  id: string,
  onChange: (key: string, value: JsonValue | undefined) => void,
): React.ReactNode {
  switch (spec.kind) {
    case "text":
    case "textarea": {
      const textfeld = (
        <TextEditor
          id={id}
          value={value}
          onChange={set}
          invalid={invalid}
          dataAttr={spec.key}
          {...(spec.typedBy && typeof data[spec.typedBy] === "string"
            ? { xsdType: data[spec.typedBy] as string }
            : {})}
        />
      );

      // Der Wert einer Property wird zur Auswahl, wenn die ConceptDescription eine
      // valueList mitbringt. Die valueId wird dann automatisch mitgesetzt (AASd-007).
      if (spec.key === "value" && "semanticId" in data) {
        return (
          <ValueWithChoices
            id={id}
            value={value}
            onChange={set}
            invalid={invalid}
            semanticId={data["semanticId"]}
            onValueIdChange={(valueId) => onChange("valueId", valueId)}
            fallback={textfeld}
          />
        );
      }
      return textfeld;
    }

    case "enum":
      return (
        <EnumEditor
          id={id}
          value={value}
          onChange={set}
          invalid={invalid}
          options={spec.enum ? ENUMS[spec.enum] : []}
          allowEmpty={!spec.required}
        />
      );

    case "boolean":
      return <BooleanEditor id={id} value={value === true} onChange={(next) => set(next)} />;

    case "langStrings":
      return <LangStringsEditor value={value} onChange={set} multiline={spec.key !== "value"} />;

    case "reference":
      return <ReferenceEditor value={value} onChange={set} />;

    case "referenceList":
      return <ReferenceListEditor value={value} onChange={set} />;

    case "qualifierList":
      return (
        <ObjectListEditor
          value={value}
          onChange={set}
          nested="Qualifier"
          labelKey="type"
          template={{ type: "", valueType: "xs:string" }}
        />
      );

    case "extensionList":
      return (
        <ObjectListEditor
          value={value}
          onChange={set}
          nested="Extension"
          labelKey="name"
          template={{ name: "" }}
        />
      );

    case "specificAssetIdList":
      return (
        <ObjectListEditor
          value={value}
          onChange={set}
          nested="SpecificAssetId"
          labelKey="name"
          template={{ name: "", value: "" }}
        />
      );

    case "administration":
      return (
        <NestedObjectEditor
          value={value}
          onChange={set}
          nested="AdministrativeInformation"
          template={{}}
        />
      );

    case "assetInformation":
      return (
        <NestedObjectEditor
          value={value}
          onChange={set}
          nested="AssetInformation"
          template={{ assetKind: "Instance" }}
          required
        />
      );

    case "attachment":
      return <AttachmentEditor id={id} value={value} onChange={set} />;

    case "blob":
      return <BlobEditor value={value} onChange={set} />;

    case "dataSpecificationList":
      return <DataSpecificationEditor value={value} onChange={set} />;

    case "valueList":
      return <ValueListEditor value={value} onChange={set} />;

    case "levelType":
      return <LevelTypeEditor value={value} onChange={set} />;
  }
}
