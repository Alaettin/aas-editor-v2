import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import type { JsonObject, JsonValue } from "@aas-editor/core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FieldEditorProps } from "./Primitives";

/**
 * Sprachabhaengige Texte: displayName, description und der Wert einer
 * MultiLanguageProperty. Im JSON ist das eine Liste aus `{ language, text }`.
 */

interface LangString extends JsonObject {
  language: string;
  text: string;
}

function toList(value: JsonValue | undefined): LangString[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is LangString =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
}

export function LangStringsEditor({
  value,
  onChange,
  multiline = false,
}: FieldEditorProps & { readonly multiline?: boolean }) {
  const { t } = useTranslation();
  const list = toList(value);

  const replace = (next: LangString[]) => onChange(next.length === 0 ? undefined : next);

  return (
    <div className="flex flex-col gap-2">
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("inspektor.leer")}</p>
      ) : null}

      {list.map((entry, index) => (
        <div key={index} className="flex items-start gap-2">
          <Input
            aria-label={t("inspektor.sprache")}
            className="w-20 shrink-0 font-mono text-xs"
            placeholder="de"
            value={entry.language ?? ""}
            onChange={(event) => {
              const next = [...list];
              next[index] = { ...entry, language: event.target.value };
              replace(next);
            }}
          />
          {multiline ? (
            <Textarea
              aria-label={t("inspektor.text")}
              rows={2}
              value={entry.text ?? ""}
              onChange={(event) => {
                const next = [...list];
                next[index] = { ...entry, text: event.target.value };
                replace(next);
              }}
            />
          ) : (
            <Input
              aria-label={t("inspektor.text")}
              value={entry.text ?? ""}
              onChange={(event) => {
                const next = [...list];
                next[index] = { ...entry, text: event.target.value };
                replace(next);
              }}
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("inspektor.entfernen")}
            onClick={() => replace(list.filter((_, i) => i !== index))}
          >
            <X />
          </Button>
        </div>
      ))}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => replace([...list, { language: "de", text: "" }])}
        >
          <Plus data-icon="inline-start" />
          {t("inspektor.hinzufuegen")}
        </Button>
      </div>
    </div>
  );
}
