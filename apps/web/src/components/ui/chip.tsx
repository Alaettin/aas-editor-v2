import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/typeOf";

/**
 * Der eine Chip des Projekts.
 *
 * Vorher lagen zehn fast gleiche Spans in Baum, Tabelle, Inspektor, Befundpanel und
 * Palette. Jede Sicht haette sonst ihre eigene Variante bekommen.
 *
 * `fill` traegt Bedeutung: **gefuellt** heisst Constraint oder harte Aussage, **weich**
 * heisst Warnung oder Zusatzinformation.
 */

const chipVariants = cva(
  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "",
        aas: "",
        sm: "",
        cd: "",
        warn: "",
        danger: "",
      },
      fill: {
        soft: "",
        solid: "",
        outline: "border bg-transparent",
      },
      size: {
        xs: "px-1 py-px text-3xs",
        sm: "px-1.5 py-0.5 text-2xs",
      },
      pill: { true: "rounded-full", false: "" },
      mono: { true: "font-mono", false: "" },
    },
    compoundVariants: [
      { tone: "neutral", fill: "soft", class: "bg-segment-track text-muted-foreground" },
      { tone: "aas", fill: "soft", class: "bg-type-aas-surface text-type-aas-text" },
      { tone: "sm", fill: "soft", class: "bg-type-sm-surface text-type-sm-text" },
      { tone: "cd", fill: "soft", class: "bg-type-cd-surface text-type-cd-text" },
      { tone: "warn", fill: "soft", class: "bg-warning-muted text-warning-text" },
      { tone: "danger", fill: "soft", class: "bg-destructive-muted text-destructive" },

      { tone: "neutral", fill: "solid", class: "bg-muted-foreground text-background" },
      { tone: "aas", fill: "solid", class: "bg-type-aas text-primary-foreground" },
      { tone: "sm", fill: "solid", class: "bg-type-sm text-primary-foreground" },
      { tone: "cd", fill: "solid", class: "bg-type-cd text-primary-foreground" },
      { tone: "warn", fill: "solid", class: "bg-warning text-warning-foreground" },
      { tone: "danger", fill: "solid", class: "bg-destructive text-destructive-foreground" },

      { tone: "neutral", fill: "outline", class: "border-border text-muted-foreground" },
      { tone: "aas", fill: "outline", class: "border-type-aas/40 text-type-aas-text" },
      { tone: "sm", fill: "outline", class: "border-type-sm-border text-type-sm-text" },
      { tone: "cd", fill: "outline", class: "border-type-cd-border text-type-cd-text" },
      { tone: "warn", fill: "outline", class: "border-warning/40 text-warning-text" },
      { tone: "danger", fill: "outline", class: "border-destructive/40 text-destructive" },
    ],
    defaultVariants: { tone: "neutral", fill: "soft", size: "xs", pill: false, mono: false },
  },
);

export interface ChipProps
  extends Omit<React.ComponentProps<"span">, "color">,
    Omit<VariantProps<typeof chipVariants>, "tone"> {
  readonly tone?: Tone;
}

export function Chip({ className, tone, fill, size, pill, mono, ...props }: ChipProps) {
  return (
    <span
      data-slot="chip"
      className={cn(chipVariants({ tone, fill, size, pill, mono }), className)}
      {...props}
    />
  );
}

export { chipVariants };
