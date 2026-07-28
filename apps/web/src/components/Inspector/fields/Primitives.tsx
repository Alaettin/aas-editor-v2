import { useEffect, useState } from "react";
import { XSD_INPUT_HINT, type JsonValue } from "@aas-editor/core";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Die einfachen Feldarten.
 *
 * Alle Eingaben halten waehrend des Tippens einen lokalen Zustand und melden erst beim
 * Verlassen beziehungsweise bei jeder Aenderung nach oben. Ohne das wuerde jeder
 * Tastendruck einen Immer-Patch, eine Worker-Nachricht und ein Rendern des Baums
 * ausloesen. So bleibt der Tastendruck unter dem Budget aus Plan Abschnitt 10.
 */

export interface FieldEditorProps {
  readonly value: JsonValue | undefined;
  readonly onChange: (value: JsonValue | undefined) => void;
  readonly id?: string;
  readonly invalid?: boolean;
  readonly dataAttr?: string;
}

export function TextEditor({
  value,
  onChange,
  id,
  invalid,
  dataAttr,
  xsdType,
}: FieldEditorProps & { readonly xsdType?: string }) {
  const aktuell = typeof value === "string" ? value : "";
  const [draft, setDraft] = useState(aktuell);

  // Aenderungen von aussen (Undo, Auswahlwechsel) uebernehmen.
  useEffect(() => setDraft(aktuell), [aktuell]);

  const hint = xsdType ? XSD_INPUT_HINT[xsdType] : undefined;

  if (hint === "boolean") {
    return (
      <BooleanEditor
        value={draft === "true"}
        onChange={(next) => onChange(next ? "true" : "false")}
        id={id}
      />
    );
  }

  return (
    <Input
      id={id}
      data-field={dataAttr}
      aria-invalid={invalid}
      type={hint === "number" ? "number" : hint === "date" ? "date" : "text"}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== aktuell) onChange(draft === "" ? undefined : draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") setDraft(aktuell);
      }}
      className={xsdType || dataAttr === "id" ? "font-mono text-xs" : undefined}
    />
  );
}

export function EnumEditor({
  value,
  onChange,
  id,
  invalid,
  options,
  allowEmpty = true,
}: FieldEditorProps & { readonly options: readonly string[]; readonly allowEmpty?: boolean }) {
  const current = typeof value === "string" ? value : "";
  return (
    <Select
      value={current === "" ? undefined : current}
      onValueChange={(next) => onChange(next === EMPTY ? undefined : next)}
    >
      <SelectTrigger id={id} aria-invalid={invalid} className="w-full">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectGroup>
          {allowEmpty ? <SelectItem value={EMPTY}>—</SelectItem> : null}
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/** Radix erlaubt keinen leeren Wert als SelectItem, deshalb dieser Platzhalter. */
const EMPTY = "__leer__";

export function BooleanEditor({
  value,
  onChange,
  id,
}: {
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly id?: string;
}) {
  return <Switch id={id} checked={value} onCheckedChange={onChange} />;
}
