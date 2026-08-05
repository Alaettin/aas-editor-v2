import { useEffect } from "react";
import { RouterProvider } from "react-router";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { router } from "@/routes/router";
import i18n from "@/i18n";
import { anwenden, useAnsicht } from "@/store/ansicht";

/**
 * Der Einstieg kennt nur den Router. Der Editor haengt hinter einer nachgeladenen Route
 * und liegt damit nicht mehr im Startbundle (Plan Abschnitt 10).
 *
 * Der Toaster steht ueber dem Router und damit ueber allen drei Routen: eine Meldung soll
 * einen Routenwechsel ueberleben, etwa beim Anlegen eines Projekts, das gleich in den
 * Editor springt.
 *
 * Erscheinung, Dichte und Sprache werden hier angewandt, nicht im Editor-Rahmen. Sonst
 * gaelten sie nur dort, und die Projektliste waere immer hell und immer deutsch.
 *
 * Der Sprachwechsel steht hier und nicht im Speicher: `store/ansicht.ts` haengt an nichts,
 * damit `i18n/index.ts` beim Start die abgelegte Sprache lesen kann, ohne einen Kreis zu
 * bilden.
 */
export function App() {
  const theme = useAnsicht((state) => state.theme);
  const density = useAnsicht((state) => state.density);
  const language = useAnsicht((state) => state.language);

  useEffect(() => {
    anwenden({ theme, density, language });
    if (i18n.language !== language) void i18n.changeLanguage(language);
  }, [theme, density, language]);

  return (
    <TooltipProvider delayDuration={400}>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
