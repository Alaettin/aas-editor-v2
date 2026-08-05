import { RouterProvider } from "react-router";

import { TooltipProvider } from "@/components/ui/tooltip";
import { router } from "@/routes/router";

/**
 * Der Einstieg kennt nur den Router. Der Editor haengt hinter einer nachgeladenen Route
 * und liegt damit nicht mehr im Startbundle (Plan Abschnitt 10).
 */
export function App() {
  return (
    <TooltipProvider delayDuration={400}>
      <RouterProvider router={router} />
    </TooltipProvider>
  );
}
