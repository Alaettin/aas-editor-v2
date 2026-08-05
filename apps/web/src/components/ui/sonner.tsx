import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";

/**
 * Abweichung von der shadcn-Vorlage, mit Grund: die Vorlage liest ihr Erscheinungsbild
 * aus `next-themes`. Der Editor haelt Erscheinung und Dichte selbst und setzt die Klasse
 * an `<html>`. Zwei Quellen fuer dieselbe Frage waeren eine zu viel.
 *
 * `theme="system"` waere ebenfalls falsch: das fragt das Betriebssystem, nicht die
 * Einstellung des Nutzers. Stattdessen erbt der Toaster ueber die Tokens, wie alles
 * andere auch.
 */
function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--error-bg": "var(--popover)",
          "--error-text": "var(--destructive)",
          "--error-border": "var(--destructive)",
          "--success-text": "var(--primary)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{ classNames: { toast: "cn-toast" } }}
      {...props}
    />
  );
}

export { Toaster };
