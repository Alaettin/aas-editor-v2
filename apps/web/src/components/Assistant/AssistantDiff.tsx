import { cn } from "@/lib/utils";
import type { DiffEintrag } from "./demo";

/**
 * Vorschlag als Diff, je Element gruppiert.
 *
 * Bewusst eine echte Komponente mit typisiertem Prop, nicht fest verdrahtetes Beispiel:
 * wenn der Assistent spaeter angebunden wird, bekommt sie echte Patches und es faellt nur
 * die Beispieldatei weg.
 */
export function AssistantDiff({ changes }: { readonly changes: readonly DiffEintrag[] }) {
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-border-subtle bg-muted font-mono text-xs">
      {changes.map((eintrag) => (
        <div key={eintrag.element}>
          <div className="flex items-center gap-2 border-y border-border-subtle bg-card px-2.5 py-1.5 first:border-t-0">
            <span aria-hidden className="size-[7px] shrink-0 rounded-xs bg-warning" />
            <span className="font-sans font-medium text-foreground">{eintrag.element}</span>
            <span className="font-sans text-2xs text-foreground-faint">{eintrag.kind}</span>
          </div>
          {eintrag.zeilen.map((zeile) => (
            <div
              key={`${eintrag.element}-${zeile.text}`}
              className={cn(
                "px-2.5 py-1.5",
                zeile.art === "entfernt"
                  ? "bg-diff-del-surface text-diff-del"
                  : "bg-diff-add-surface text-diff-add",
              )}
            >
              {zeile.art === "entfernt" ? "- " : "+ "}
              {zeile.text}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
