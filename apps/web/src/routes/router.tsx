import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router";

import { LoginRoute } from "./LoginRoute";
import { RequireAuth } from "./RequireAuth";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Der Editor wird erst beim Betreten seiner Route geladen.
 *
 * Damit das wirkt, darf **keine** Datei in diesem Ordner `store/editor` oder `AppShell`
 * statisch importieren, auch nicht ueber einen Typ-Import mit Laufzeitwirkung. Sonst
 * liegt der Editor wieder im Startbundle und `pnpm budget` schlaegt an.
 */
const EditorRoute = lazy(() =>
  import("./EditorRoute").then((modul) => ({ default: modul.EditorRoute })),
);

/**
 * Die Projektliste ebenfalls, aus demselben Grund.
 *
 * Erste Seite ist immer die Anmeldung. Die Liste zog bisher ihren eigenen Chunk und den
 * kompletten AlertDialog von Radix in den Startgraphen, zusammen rund 52 KB gzip, die
 * beim Anmelden niemand braucht.
 */
const ProjectsRoute = lazy(() =>
  import("./ProjectsRoute").then((modul) => ({ default: modul.ProjectsRoute })),
);

function EditorLaedt() {
  return (
    <div className="flex h-screen flex-col gap-3 p-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="min-h-0 flex-1 w-full" />
    </div>
  );
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginRoute /> },
  {
    element: <RequireAuth />,
    children: [
      { path: "/", element: <Navigate to="/projekte" replace /> },
      {
        path: "/projekte",
        element: (
          <Suspense fallback={<EditorLaedt />}>
            <ProjectsRoute />
          </Suspense>
        ),
      },
      {
        path: "/editor/:id",
        element: (
          <Suspense fallback={<EditorLaedt />}>
            <EditorRoute />
          </Suspense>
        ),
      },
      {
        // Der dateibasierte Betrieb bleibt erreichbar: oeffnen, ansehen, exportieren,
        // ohne dass etwas auf dem Server liegt.
        path: "/editor",
        element: (
          <Suspense fallback={<EditorLaedt />}>
            <EditorRoute />
          </Suspense>
        ),
      },
    ],
  },
  { path: "*", element: <Navigate to="/projekte" replace /> },
]);
