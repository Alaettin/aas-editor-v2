import { cn } from "@/lib/utils";

/**
 * Rechtsbuendiger Zaehler, wie er im Baum hinter jedem Container steht. `data-numeric`
 * sorgt fuer Tabellenziffern, sonst springt die Spalte beim Blaettern.
 */
export function CountBadge({ value, className }: { value: number; className?: string }) {
  return (
    <span data-numeric className={cn("ml-auto shrink-0 text-2xs text-foreground-faint", className)}>
      {value}
    </span>
  );
}
