import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEditor } from "@/store/editor";

/**
 * Zwei Staende, ein Projekt. Es wird nichts still ueberschrieben und nichts wiederholt:
 * der Nutzer entscheidet, und jeder der drei Wege ist benannt.
 */
export function ConflictDialog() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const konflikt = useEditor((state) => state.serverKonflikt);
  const projektId = useEditor((state) => state.projektId);
  const projektName = useEditor((state) => state.projektName);
  const revision = useEditor((state) => state.revision);
  const ladeProjekt = useEditor((state) => state.ladeProjekt);
  const speichern = useEditor((state) => state.speichern);
  const alsNeues = useEditor((state) => state.alsNeuesProjektSpeichern);
  const schliessen = useEditor((state) => state.konfliktSchliessen);

  /** Welcher der drei Wege gerade laeuft. Ein blosses "disabled" sagt nicht, welcher. */
  type Weg = "neu" | "ueberschreiben" | "server";
  const [laeuft, setLaeuft] = useState<Weg | null>(null);

  const serverstandLaden = async () => {
    if (projektId === null) return;
    setLaeuft("server");
    schliessen();
    // ladeProjekt springt ab, wenn dasselbe Projekt schon offen ist. Der Umweg ueber
    // einen leeren Stand ist hier nicht noetig: der Konflikt setzt die Kennung nicht.
    useEditor.setState({ projektId: null });
    await ladeProjekt(projektId);
    setLaeuft(null);
  };

  const alsNeuesSpeichern = async () => {
    setLaeuft("neu");
    schliessen();
    const neueId = await alsNeues(`${projektName ?? "Projekt"} (Kopie)`);
    setLaeuft(null);
    if (neueId !== null) void navigate(`/editor/${neueId}`);
  };

  const ueberschreiben = async () => {
    if (konflikt === null) return;
    setLaeuft("ueberschreiben");
    // Die eigene Revision auf den Serverstand heben, damit das Speichern greift. Der
    // Server legt vorher selbst nichts an, deshalb wird hier eine Version erzeugt.
    await useEditor.getState().versionAnlegen(t("konflikt.versionLabel"));
    useEditor.setState({ revision: konflikt.aktuelleRevision, serverKonflikt: null });
    await speichern();
    setLaeuft(null);
  };

  return (
    <Dialog open={konflikt !== null} onOpenChange={(offen) => !offen && schliessen()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("konflikt.titel")}</DialogTitle>
          <DialogDescription>
            {t("konflikt.text", {
              eigene: revision,
              server: konflikt?.aktuelleRevision ?? 0,
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            disabled={laeuft !== null}
            onClick={() => void alsNeuesSpeichern()}
          >
            {laeuft === "neu" ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : null}
            {t("konflikt.alsNeues")}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={laeuft !== null}
            onClick={() => void ueberschreiben()}
          >
            {laeuft === "ueberschreiben" ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : null}
            {t("konflikt.ueberschreiben")}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            disabled={laeuft !== null}
            onClick={() => void serverstandLaden()}
          >
            {laeuft === "server" ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : null}
            {t("konflikt.serverstand")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
