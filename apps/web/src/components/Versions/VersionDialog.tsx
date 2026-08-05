import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Loader2 } from "lucide-react";

import { versionsApi, type VersionSummary } from "@/api/projects";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { meldeFehler } from "@/lib/melden";
import { useEditor } from "@/store/editor";

interface Props {
  readonly offen: boolean;
  readonly onClose: () => void;
}

export function VersionDialog({ offen, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const projektId = useEditor((state) => state.projektId);
  const versionAnlegen = useEditor((state) => state.versionAnlegen);
  const versionLaden = useEditor((state) => state.versionLaden);

  const [versionen, setVersionen] = useState<readonly VersionSummary[]>([]);
  const [label, setLabel] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [laedt, setLaedt] = useState(false);
  /**
   * Der Fehler steht **im Dialog**, nicht nur im Toaster. Ein Toaster hinter einem
   * offenen Dialog ist zwar sichtbar, aber weit weg von der Stelle, an der gehandelt
   * wurde. Frueher fing hier gar nichts, ein Fehlschlag verpuffte als unbehandelte
   * Zusage und die leere Liste sah aus wie "keine Versionen".
   */
  const [fehler, setFehler] = useState<string | null>(null);

  const datum = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });

  const laden = useCallback(async () => {
    if (projektId === null) return;
    setLaedt(true);
    setFehler(null);
    try {
      const page = await versionsApi.list(projektId);
      setVersionen(page.items);
    } catch (error) {
      meldeFehler(error, "fehler.versionen");
      setFehler((error as Error).message);
    } finally {
      setLaedt(false);
    }
  }, [projektId]);

  useEffect(() => {
    if (offen) void laden();
  }, [offen, laden]);

  const anlegen = async () => {
    setLaeuft(true);
    setFehler(null);
    const geklappt = await versionAnlegen(label.trim() === "" ? null : label.trim());
    if (geklappt) {
      setLabel("");
      await laden();
    } else {
      setFehler(t("fehler.version"));
    }
    setLaeuft(false);
  };

  return (
    <Dialog open={offen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("versionen.titel")}</DialogTitle>
          <DialogDescription>{t("versionen.text")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="versionslabel" className="mb-1 text-2xs text-muted-foreground">
              {t("versionen.labelPlatzhalter")}
            </Label>
            <Input
              id="versionslabel"
              value={label}
              placeholder={t("versionen.labelPlatzhalter")}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <Button disabled={laeuft || projektId === null} onClick={() => void anlegen()}>
            {laeuft ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
            {t("versionen.anlegen")}
          </Button>
        </div>

        {fehler ? (
          <p role="alert" className="text-sm text-destructive">
            {fehler}
          </p>
        ) : null}

        <ul className="max-h-72 divide-y divide-border overflow-auto rounded-md border border-border">
          {laedt ? (
            <li className="px-3 py-4 text-sm text-muted-foreground">{t("status.wirdGelesen")}</li>
          ) : null}
          {!laedt && versionen.length === 0 && fehler === null ? (
            <li className="px-3 py-4 text-sm text-muted-foreground">{t("versionen.leer")}</li>
          ) : null}
          {versionen.map((version) => (
            <li key={version.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  {version.label ?? t("versionen.ohneLabel")}
                </span>
                <span className="block text-2xs text-muted-foreground" data-numeric>
                  {t("versionen.zeile", {
                    datum: datum.format(version.createdAt),
                    revision: version.revision,
                    knoten: version.nodeCount,
                  })}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Erst schliessen, wenn es geklappt hat: sonst verschwindet der Dialog
                  // und der Fehlschlag steht nirgends mehr.
                  void versionLaden(version.id).then((geklappt) => {
                    if (geklappt) onClose();
                    else setFehler(t("fehler.versionLaden"));
                  });
                }}
              >
                {t("versionen.laden")}
              </Button>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("versionen.schliessen")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
