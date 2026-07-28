import type { FieldSpec, JsonObject, JsonValue } from "@aas-editor/core";

import { FieldGroup } from "@/components/ui/field";
import { FieldRenderer } from "./FieldRenderer";

/**
 * Die Felder eines eingebetteten Objekts (Qualifier, Extension, AssetInformation ...).
 * Derselbe Renderer wie oben, nur ohne Gruppenueberschriften.
 */
export function NestedFields({
  spec,
  data,
  onChange,
}: {
  readonly spec: readonly FieldSpec[];
  readonly data: JsonObject;
  readonly onChange: (key: string, value: JsonValue | undefined) => void;
}) {
  return (
    <FieldGroup className="gap-3">
      {spec.map((field) => (
        <FieldRenderer key={field.key} spec={field} data={data} onChange={onChange} />
      ))}
    </FieldGroup>
  );
}
