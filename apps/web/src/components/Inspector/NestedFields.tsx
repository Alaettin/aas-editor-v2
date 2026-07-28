import { NESTED_SPECS, type JsonObject, type JsonValue } from "@aas-editor/core";

import { FieldGroup } from "@/components/ui/field";
import { FieldRenderer } from "./FieldRenderer";

/**
 * Die Felder eines eingebetteten Objekts (Qualifier, Extension, AssetInformation,
 * DataSpecificationIec61360 ...). Derselbe Renderer wie oben, nur ohne
 * Gruppenueberschriften.
 */
export function NestedFields({
  nested,
  data,
  onChange,
}: {
  /** Schluessel in NESTED_SPECS, etwa "Qualifier" */
  readonly nested: string;
  readonly data: JsonObject;
  readonly onChange: (key: string, value: JsonValue | undefined) => void;
}) {
  const spec = NESTED_SPECS[nested] ?? [];

  return (
    <FieldGroup className="gap-3">
      {spec.map((field) => (
        <FieldRenderer key={field.key} spec={field} data={data} onChange={onChange} />
      ))}
    </FieldGroup>
  );
}
