import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * `bare` ist die randlose Eingabe fuer Tabellenzellen und das Filterfeld: dort traegt die
 * Zeile die Form, nicht das Feld. Vorher stand derselbe Override-String an zwei Stellen.
 */
const inputVariants = cva(
  "w-full min-w-0 text-base transition-colors outline-none placeholder:text-foreground-faint disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-warning aria-invalid:ring-3 aria-invalid:ring-warning/15",
  {
    variants: {
      variant: {
        default:
          "h-8 rounded-lg border border-input bg-input-fill px-2.5 py-1 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:bg-input/50",
        bare: "h-6 border-0 bg-transparent px-1 shadow-none focus-visible:bg-card focus-visible:ring-1 focus-visible:ring-ring/40",
      },
    },
    defaultVariants: { variant: "default" },
  },
)

function Input({
  className,
  type,
  variant,
  ...props
}: React.ComponentProps<"input"> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Input, inputVariants }
