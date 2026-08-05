import { cn } from "@/lib/utils";

/**
 * Tastenhinweis, etwa im Filterfeld oder neben dem Assistenten-Knopf. Nur Anzeige, nie
 * anklickbar: der Weg dahin ist die Taste oder der Knopf daneben.
 */
export function KbdHint({ children, className }: { children: string; className?: string }) {
  return (
    <kbd
      className={cn(
        "rounded-xs border border-border-subtle px-1 py-px text-3xs leading-none text-foreground-faint",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
