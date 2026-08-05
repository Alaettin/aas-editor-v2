import { cn } from "@/lib/utils";

/**
 * Versalienlabel der Mockups: EXPLORER, ALLGEMEIN, WERT, SEMANTIK, KONTEXT und die
 * Tabellenkopfzeile. Bewusst kein `<h*>`, es ist eine Beschriftung, keine Ueberschrift der
 * Dokumentgliederung.
 */
export function SectionLabel({
  children,
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="section-label"
      className={cn(
        "text-2xs font-semibold tracking-[0.08em] text-muted-foreground uppercase",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
