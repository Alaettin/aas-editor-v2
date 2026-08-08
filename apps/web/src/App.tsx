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
 * Die Sprache wird hier angewandt, nicht im Editor-Rahmen. Sonst gaelte sie nur dort, und
 * die Projektliste waere immer deutsch.
 *
 * Der Sprachwechsel steht hier und nicht im Speicher: `store/ansicht.ts` haengt an nichts,
 * damit `i18n/index.ts` beim Start die abgelegte Sprache lesen kann, ohne einen Kreis zu
 * bilden.
 */
export function App() {
  const language = useAnsicht((state) => state.language);

  useEffect(() => {
    anwenden({ language });
    if (i18n.language !== language) void i18n.changeLanguage(language);
  }, [language]);

  return (
    <TooltipProvider delayDuration={400}>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
