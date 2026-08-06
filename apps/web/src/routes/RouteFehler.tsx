import { useRouteError } from "react-router";
import { useTranslation } from "react-i18next";
import { RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Die letzte Auffangstelle einer Route.
 *
 * Bis zum 06.08.2026 gab es keine: ein Renderfehler oder ein fehlgeschlagenes Nachladen
 * ergab eine weisse Seite ohne Weg zurueck. Der zweite Fall ist nach einem Deployment der
 * Normalfall, nicht die Ausnahme: der Browser haelt eine alte `index.html` mit den alten
 * Chunk-Namen, und die gibt es auf dem Server nicht mehr.
 *
 * Deshalb ist **Neu laden** der erste Knopf. Er holt `index.html` und damit die aktuellen
 * Namen; alles andere hilft in diesem Fall nicht.
 *
 * Bewusst ohne Zugriff auf den Editor-Speicher und ohne `useAuth`: diese Datei haengt am
 * Router, und der Router darf nichts aus dem Editor statisch importieren, sonst liegt der
 * Editor wieder im Startbundle.
 */
export function RouteFehler() {
  const { t } = useTranslation();
  const fehler = useRouteError();

  // Der Stapel gehoert in die Konsole, nicht auf die Seite. Auf der Seite steht der Satz,
  // mit dem man etwas anfangen kann.
  const grund = fehler instanceof Error ? fehler.message : String(fehler);

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <TriangleAlert className="size-9 text-warning-text" aria-hidden />

      <div className="max-w-lg space-y-2">
        <h1 className="font-display text-2xl font-bold text-foreground">
          {t("fehler.seite.titel")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("fehler.seite.text")}</p>
        <p className="font-mono text-2xs break-words text-mono-foreground">{grund}</p>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={() => window.location.reload()}>
          <RotateCcw data-icon="inline-start" />
          {t("fehler.seite.neuLaden")}
        </Button>
        {/*
          Ein echter Seitenwechsel, kein `navigate`: haengt der Fehler am Router selbst,
          bringt ein Wechsel innerhalb desselben Dokuments nichts.
        */}
        <Button variant="outline" onClick={() => (window.location.href = "/projekte")}>
          {t("fehler.seite.zurListe")}
        </Button>
      </div>
    </main>
  );
}
