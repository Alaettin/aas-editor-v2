import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/typeOf";

/**
 * Der Typpunkt aus den Mockups. Er ersetzt im Baum die frueheren Typ-Badges: ein Punkt je
 * Zeile statt eines Wortes kostet keinen Platz und bleibt beim Blaettern lesbar.
 *
 * Gefuellt und eckig (r3) heisst Identifiable, umrandet und rund heisst SubmodelElement.
 */

const FLAECHE: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  aas: "bg-type-aas",
  sm: "bg-type-sm",
  cd: "bg-type-cd",
  warn: "bg-warning",
  danger: "bg-destructive",
};

const RAND: Record<Tone, string> = {
  neutral: "border-foreground-faint",
  aas: "border-type-aas",
  sm: "border-type-sm",
  cd: "border-type-cd",
  warn: "border-warning",
  danger: "border-destructive",
};

interface Props {
  readonly tone: Tone;
  readonly variant?: "filled" | "outline";
  readonly className?: string;
}

export function TypeDot({ tone, variant = "filled", className }: Props) {
  return (
    <span
      aria-hidden
      data-slot="type-dot"
      className={cn(
        "size-2 shrink-0",
        variant === "filled"
          ? cn("rounded-[3px]", FLAECHE[tone])
          : cn("rounded-full border-[1.5px]", RAND[tone]),
        className,
      )}
    />
  );
}
