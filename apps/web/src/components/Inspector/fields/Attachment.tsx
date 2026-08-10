import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Paperclip, X } from "lucide-react";
import type { JsonValue } from "@aas-editor/core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalisiere as normalize, zielPfad } from "@/lib/anhangspfade";
import { meldeHinweis } from "@/lib/melden";
import { useEditor, NO_ATTACHMENTS } from "@/store/editor";
import type { FieldEditorProps } from "./Primitives";
import { useEntwurf } from "./useEntwurf";

/**
 * File-Element: der Wert ist ein **Pfad** in den Paketcontainer, nicht der Inhalt
 * (Plan Abschnitt 5). Angezeigt wird deshalb der Pfad plus der Befund, ob unter diesem
 * Pfad tatsaechlich ein Anhang im Paket liegt.
 */
export function AttachmentEditor({ value, onChange, id }: FieldEditorProps) {
  const { t } = useTranslation();
  const attachments = useEditor((state) => state.meta?.attachments ?? NO_ATTACHMENTS);
  const model = useEditor((state) => state.model);
  const anhangSetzen = useEditor((state) => state.anhangSetzen);
  const anhangEntfernen = useEditor((state) => state.anhangEntfernen);
  const inputRef = useRef<HTMLInputElement>(null);

  const path = typeof value === "string" ? value : "";
  const found = attachments.find((entry) => entry.path === normalize(path));
  const entwurf = useEntwurf(path, (naechster) =>
    onChange(naechster === "" ? undefined : naechster),
  );

  return (
    <div className="flex flex-col gap-2">
      <Input
        id={id}
        className="font-mono text-xs"
        placeholder="/aasx/files/handbuch.pdf"
        value={entwurf.wert}
        onChange={(event) => entwurf.setzen(event.target.value)}
        onBlur={entwurf.abgeben}
        onKeyDown={entwurf.aufTaste}
      />
      {path === "" ? null : found ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Paperclip className="size-3" />
          {found.contentType}, {formatSize(found.size)}
        </p>
      ) : (
        <p className="text-xs text-warning">{t("inspektor.keinAnhang")}</p>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          {found ? t("inspektor.dateiErsetzen") : t("inspektor.dateiWaehlen")}
        </Button>
        {found ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void anhangEntfernen(normalize(path))}
          >
            <X data-icon="inline-start" />
            {t("inspektor.entfernen")}
          </Button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;

          /*
           * Ohne Pfad ist der Anhang fuer das Modell unsichtbar: das File-Element zeigt
           * auf nichts, und beim Export faende ihn niemand. Steht noch keiner da, wird er
           * aus dem Dateinamen gebildet und gleich mitgesetzt.
           */
          const { ziel, abgezweigt } = zielPfad(path, file.name, model, (kandidat) =>
            attachments.some((eintrag) => eintrag.path === kandidat),
          );
          const typ = file.type === "" ? "application/octet-stream" : file.type;

          await anhangSetzen(ziel, typ, new Uint8Array(await file.arrayBuffer()));
          if (ziel !== normalize(path)) onChange(ziel as JsonValue);
          // Sonst aendert sich der Pfad im Feld darueber scheinbar von allein.
          if (abgezweigt) meldeHinweis("inspektor.anhangAbgezweigt", { pfad: ziel });
        }}
      />
    </div>
  );
}

/**
 * Blob-Element: der Inhalt liegt im Modell selbst, base64-kodiert. Er ueberlebt damit
 * jeden Export, auch nach reinem JSON.
 */
export function BlobEditor({ value, onChange }: FieldEditorProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const base64 = typeof value === "string" ? value : "";

  return (
    <div className="flex flex-col gap-2">
      {base64 === "" ? (
        <p className="text-xs text-muted-foreground">{t("inspektor.leer")}</p>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Paperclip className="size-3" />
          {formatSize(Math.floor((base64.length * 3) / 4))}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          {base64 === "" ? t("inspektor.dateiWaehlen") : t("inspektor.dateiErsetzen")}
        </Button>
        {base64 === "" ? null : (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>
            <X data-icon="inline-start" />
            {t("inspektor.entfernen")}
          </Button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const bytes = new Uint8Array(await file.arrayBuffer());
          onChange(toBase64(bytes) as JsonValue);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
