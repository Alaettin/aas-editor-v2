import { RouterProvider } from "react-router";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { router } from "@/routes/router";

/**
 * Der Einstieg kennt nur den Router. Der Editor haengt hinter einer nachgeladenen Route
 * und liegt damit nicht mehr im Startbundle (Plan Abschnitt 10).
 *
 * Der Toaster steht ueber dem Router und damit ueber allen drei Routen: eine Meldung soll
 * einen Routenwechsel ueberleben, etwa beim Anlegen eines Projekts, das gleich in den
 * Editor springt.
 */
export function App() {
  return (
    <TooltipProvider delayDuration={400}>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
