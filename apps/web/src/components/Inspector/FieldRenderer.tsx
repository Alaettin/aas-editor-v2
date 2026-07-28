import { useTranslation } from "react-i18next";
import { ENUMS, type FieldSpec, type JsonObject, type JsonValue } from "@aas-editor/core";
import type { ValidationIssue } from "@aas-editor/core/validation";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { IssueText } from "@/components/Issues/IssueText";
import { EnumEditor, TextEditor } from "./fields/Primitives";
import { LangStringsEditor } from "./fields/LangStrings";
import { ReferenceEditor, ReferenceListEditor } from "./fields/Reference";
import {
  DataSpecificationListEditor,
  NestedObjectEditor,
  ObjectListEditor,
} from "./fields/ObjectList";
import { AttachmentEditor, BlobEditor } from "./fields/Attachment";
import { BooleanEditor } from "./fields/Primitives";

/**
 * Der generische Renderer: eine Feldbeschreibung hinein, das passende Eingabefeld
 * heraus. Ein neuer Feldtyp im Metamodell braucht hier einen Zweig, nicht 14 neue
 * Formulare.
 */

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

  const control = renderControl(spec, value, data, set, invalid, id);
  const orientation = spec.kind === "boolean" ? "horizontal" : "vertical";

  return (
    <Field
      data-invalid={invalid || undefined}
      data-field-key={spec.key}
      orientation={orientation}
    >
      <FieldLabel htmlFor={id}>
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
): React.ReactNode {
  switch (spec.kind) {
    case "text":
    case "textarea":
      return (
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
      return (
        <BooleanEditor id={id} value={value === true} onChange={(next) => set(next)} />
      );

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
      return <AttachmentEditor value={value} onChange={set} />;

    case "blob":
      return <BlobEditor value={value} onChange={set} />;

    case "dataSpecificationList":
      return <DataSpecificationListEditor value={value} onChange={set} />;
  }
}
