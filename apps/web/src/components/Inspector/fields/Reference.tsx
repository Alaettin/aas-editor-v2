import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { KEY_TYPES, REFERENCE_TYPES, type JsonObject, type JsonValue } from "@aas-editor/core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EnumEditor, type FieldEditorProps } from "./Primitives";
import { useEntwurf } from "./useEntwurf";

/**
 * Reference-Editor.
 *
 * Eine Reference besteht aus dem Typ (ExternalReference oder ModelReference) und einer
 * geordneten Liste von Keys. Die Keys sind die eigentliche Substanz, sie bekommen
 * deshalb eine kompakte Zeilendarstellung statt eines aufgeklappten Unterformulars.
 */

interface Key extends JsonObject {
  type: string;
  value: string;
}

interface Reference extends JsonObject {
  type: string;
  keys: Key[];
}

function toReference(value: JsonValue | undefined): Reference | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as JsonObject;
  return {
    type: typeof record["type"] === "string" ? record["type"] : "ExternalReference",
    keys: Array.isArray(record["keys"]) ? (record["keys"] as Key[]) : [],
    ...(record["referredSemanticId"] !== undefined
      ? { referredSemanticId: record["referredSemanticId"] }
      : {}),
  };
}

export function ReferenceEditor({ value, onChange }: FieldEditorProps) {
  const { t } = useTranslation();
  const reference = toReference(value);

  if (!reference) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange({
            type: "ExternalReference",
            keys: [{ type: "GlobalReference", value: "" }],
          })
        }
      >
        <Plus data-icon="inline-start" />
        {t("inspektor.hinzufuegen")}
      </Button>
    );
  }

  const update = (next: Reference) => onChange(next as unknown as JsonValue);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-2">
      <div className="flex items-center gap-2">
        <div className="w-44 shrink-0">
          <EnumEditor
            value={reference.type}
            onChange={(next) => update({ ...reference, type: (next as string) ?? "" })}
            options={REFERENCE_TYPES}
            allowEmpty={false}
          />
        </div>
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

      {reference.keys.map((key, index) => (
        <SchluesselZeile
          key={index}
          schluessel={key}
          onAendern={(naechster) => {
            const keys = [...reference.keys];
            keys[index] = naechster;
            update({ ...reference, keys });
          }}
          onEntfernen={() =>
            update({ ...reference, keys: reference.keys.filter((_, i) => i !== index) })
          }
        />
      ))}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            update({
              ...reference,
              keys: [
                ...reference.keys,
                {
                  type: reference.type === "ModelReference" ? "Submodel" : "GlobalReference",
                  value: "",
                },
              ],
            })
          }
        >
          <Plus data-icon="inline-start" />
          {t("inspektor.schluessel")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Ein Schluessel als eigene Zeile. Der Wert haelt seinen Entwurf, bis das Feld verlassen
 * wird, siehe `useEntwurf`: eine Key-URL ist lang, und jedes Zeichen loeste vorher den
 * ganzen Aenderungsweg aus.
 */
function SchluesselZeile({
  schluessel,
  onAendern,
  onEntfernen,
}: {
  readonly schluessel: Key;
  readonly onAendern: (schluessel: Key) => void;
  readonly onEntfernen: () => void;
}) {
  const { t } = useTranslation();
  const wert = useEntwurf(schluessel.value ?? "", (naechster) =>
    onAendern({ ...schluessel, value: naechster }),
  );

  return (
    <div className="flex items-center gap-2">
      <div className="w-44 shrink-0">
        <EnumEditor
          value={schluessel.type}
          onChange={(next) => onAendern({ ...schluessel, type: (next as string) ?? "" })}
          options={KEY_TYPES}
          allowEmpty={false}
        />
      </div>
      <Input
        aria-label={t("inspektor.schluesselWert")}
        className="font-mono text-xs"
        value={wert.wert}
        onChange={(event) => wert.setzen(event.target.value)}
        onBlur={wert.abgeben}
        onKeyDown={wert.aufTaste}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("inspektor.entfernen")}
        onClick={onEntfernen}
      >
        <X />
      </Button>
    </div>
  );
}

export function ReferenceListEditor({ value, onChange }: FieldEditorProps) {
  const { t } = useTranslation();
  const list = Array.isArray(value) ? value : [];

  const replace = (next: JsonValue[]) => onChange(next.length === 0 ? undefined : next);

  return (
    <div className="flex flex-col gap-2">
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("inspektor.leer")}</p>
      ) : null}

      {list.map((entry, index) => (
        <ReferenceEditor
          key={index}
          value={entry}
          onChange={(next) => {
            if (next === undefined) replace(list.filter((_, i) => i !== index));
            else {
              const copy = [...list];
              copy[index] = next;
              replace(copy);
            }
          }}
        />
      ))}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            replace([
              ...list,
              { type: "ExternalReference", keys: [{ type: "GlobalReference", value: "" }] },
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
