import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { FilePlus2, LogOut, Trash2 } from "lucide-react";

import { NewProjectDialog } from "@/components/Projects/NewProjectDialog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/store/auth";
import { useProjects } from "@/store/projects";

/**
 * Einstiegspunkt nach der Anmeldung. Kein Import aus store/editor: dieser Bildschirm
 * liegt im Startbundle, der Editor wird erst beim Oeffnen eines Projekts geladen.
 */
export function ProjectsRoute() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const projekte = useProjects((state) => state.projekte);
  const status = useProjects((state) => state.status);
  const fehler = useProjects((state) => state.fehler);
  const cursor = useProjects((state) => state.cursor);
  const laden = useProjects((state) => state.laden);
  const mehrLaden = useProjects((state) => state.mehrLaden);
  const loeschen = useProjects((state) => state.loeschen);

  const benutzer = useAuth((state) => state.benutzer);
  const abmelden = useAuth((state) => state.abmelden);

  const [neuOffen, setNeuOffen] = useState(false);
  const [zuLoeschen, setZuLoeschen] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    void laden();
  }, [laden]);

  const datum = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="mx-auto flex h-screen max-w-4xl flex-col gap-6 p-8">
      <header className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">{t("projekte.titel")}</h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-2xs text-muted-foreground">{benutzer?.name}</span>
          <Button variant="ghost" size="sm" onClick={() => void abmelden()}>
            <LogOut data-icon="inline-start" />
            {t("anmeldung.abmelden")}
          </Button>
          <Button size="sm" onClick={() => setNeuOffen(true)}>
            <FilePlus2 data-icon="inline-start" />
            {t("projekte.neu")}
          </Button>
        </div>
      </header>

      {status === "laedt" ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : null}

      {fehler ? (
        <p role="alert" className="text-sm text-destructive">
          {fehler}
        </p>
      ) : null}

      {status === "bereit" && projekte.length === 0 ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyTitle>{t("projekte.leerTitel")}</EmptyTitle>
            <EmptyDescription>{t("projekte.leerText")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setNeuOffen(true)}>{t("projekte.neu")}</Button>
          </EmptyContent>
        </Empty>
      ) : null}

      {projekte.length > 0 ? (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-auto rounded-md border border-border">
          {projekte.map((projekt) => (
            <li key={projekt.id} className="flex items-center gap-3 px-4 py-3 hover:bg-accent">
              <button
                type="button"
                data-projekt={projekt.id}
                className="min-w-0 flex-1 text-left"
                onClick={() => void navigate(`/editor/${projekt.id}`)}
              >
                <span className="block truncate text-sm font-medium">{projekt.name}</span>
                <span className="block text-2xs text-muted-foreground" data-numeric>
                  {t("projekte.zeile", {
                    knoten: projekt.nodeCount,
                    revision: projekt.revision,
                    datum: datum.format(projekt.updatedAt),
                  })}
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("projekte.loeschen")}
                onClick={() => setZuLoeschen({ id: projekt.id, name: projekt.name })}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {cursor !== null ? (
        <Button variant="outline" onClick={() => void mehrLaden()}>
          {t("projekte.mehr")}
        </Button>
      ) : null}

      <NewProjectDialog
        offen={neuOffen}
        onClose={() => setNeuOffen(false)}
        onAngelegt={(id) => void navigate(`/editor/${id}`)}
      />

      <AlertDialog open={zuLoeschen !== null} onOpenChange={(offen) => !offen && setZuLoeschen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("projekte.loeschenTitel")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("projekte.loeschenText", { name: zuLoeschen?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("projekte.abbrechen")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (zuLoeschen) void loeschen(zuLoeschen.id);
                setZuLoeschen(null);
              }}
            >
              {t("projekte.loeschen")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
