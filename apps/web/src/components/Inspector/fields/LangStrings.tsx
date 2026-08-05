import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import type { JsonObject, JsonValue } from "@aas-editor/core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FieldEditorProps } from "./Primitives";
import { useEntwurf } from "./useEntwurf";

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
        <SprachZeile
          key={index}
          eintrag={entry}
          multiline={multiline}
          onAendern={(naechster) => {
            const next = [...list];
            next[index] = naechster;
            replace(next);
          }}
          onEntfernen={() => replace(list.filter((_, i) => i !== index))}
        />
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

/**
 * Eine Zeile fuer sich, damit beide Felder ihren eigenen Entwurf halten koennen.
 *
 * Vorher schrieb jedes Zeichen sofort in das Modell. Bei zehntausend Elementen lief damit
 * je Tastendruck der ganze Aenderungsweg, siehe `useEntwurf`.
 */
function SprachZeile({
  eintrag,
  multiline,
  onAendern,
  onEntfernen,
}: {
  readonly eintrag: LangString;
  readonly multiline: boolean;
  readonly onAendern: (eintrag: LangString) => void;
  readonly onEntfernen: () => void;
}) {
  const { t } = useTranslation();
  const sprache = useEntwurf(eintrag.language ?? "", (wert) =>
    onAendern({ ...eintrag, language: wert }),
  );
  const text = useEntwurf(eintrag.text ?? "", (wert) => onAendern({ ...eintrag, text: wert }));

  return (
    <div className="flex items-start gap-2">
      <Input
        aria-label={t("inspektor.sprache")}
        className="w-20 shrink-0 font-mono text-xs"
        placeholder="de"
        value={sprache.wert}
        onChange={(event) => sprache.setzen(event.target.value)}
        onBlur={sprache.abgeben}
        onKeyDown={sprache.aufTaste}
      />
      {multiline ? (
        <Textarea
          aria-label={t("inspektor.text")}
          rows={2}
          value={text.wert}
          onChange={(event) => text.setzen(event.target.value)}
          onBlur={text.abgeben}
          onKeyDown={text.aufTaste}
        />
      ) : (
        <Input
          aria-label={t("inspektor.text")}
          value={text.wert}
          onChange={(event) => text.setzen(event.target.value)}
          onBlur={text.abgeben}
          onKeyDown={text.aufTaste}
        />
      )}
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
