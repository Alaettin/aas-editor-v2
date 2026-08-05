import { useEffect } from "react";
import { RouterProvider } from "react-router";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { router } from "@/routes/router";
import { anwenden, useAnsicht } from "@/store/ansicht";

/**
 * Der Einstieg kennt nur den Router. Der Editor haengt hinter einer nachgeladenen Route
 * und liegt damit nicht mehr im Startbundle (Plan Abschnitt 10).
 *
 * Der Toaster steht ueber dem Router und damit ueber allen drei Routen: eine Meldung soll
 * einen Routenwechsel ueberleben, etwa beim Anlegen eines Projekts, das gleich in den
 * Editor springt.
 *
 * Erscheinung und Dichte werden hier an das Wurzelelement geschrieben, nicht im
 * Editor-Rahmen. Sonst gaelten sie nur dort, und die Projektliste waere immer hell.
 */
export function App() {
  const theme = useAnsicht((state) => state.theme);
  const density = useAnsicht((state) => state.density);

  useEffect(() => anwenden(theme, density), [theme, density]);

  return (
    <TooltipProvider delayDuration={400}>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
