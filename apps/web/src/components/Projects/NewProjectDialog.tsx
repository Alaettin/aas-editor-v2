import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { FolderOpen, Loader2 } from "lucide-react";

import { ApiError } from "@/api/client";
import { projectsApi } from "@/api/projects";
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
import { SectionLabel } from "@/components/ui/section-label";
import { meldeErfolg, meldeFehler } from "@/lib/melden";
import { legeDateiAb } from "@/store/pendingFile";
import { useProjects } from "@/store/projects";

/**
 * Neues Projekt, leer oder aus einer Datei.
 *
 * Die Datei wird hier **nicht** gelesen. Sie wird abgelegt und im Editor geoeffnet, weil
 * Import und Modell erst mit dem Editor geladen werden sollen.
 *
 * Der Name muss eindeutig sein. Geprueft wird waehrend des Tippens, damit man es merkt,
 * bevor man abschickt; entschieden wird trotzdem im Server, denn zwischen der Pruefung und
 * dem Absenden kann ein anderer Tab denselben Namen belegen.
 */

const PAUSE = 300;

interface Props {
  readonly offen: boolean;
  readonly onClose: () => void;
  readonly onAngelegt: (id: string) => void;
}

export function NewProjectDialog({ offen, onClose, onAngelegt }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const anlegen = useProjects((state) => state.anlegen);
  const dateiRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [datei, setDatei] = useState<File | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [vergeben, setVergeben] = useState(false);
  const [prueftName, setPrueftName] = useState(false);

  const getrimmt = name.trim();

  // Die Pruefung auf einen vergebenen Namen, entprellt. Ohne die Pause ginge je
  // Tastendruck eine Anfrage an den Server.
  useEffect(() => {
    if (getrimmt === "") {
      setVergeben(false);
      setPrueftName(false);
      return;
    }
    setPrueftName(true);
    let gilt = true;
    const kennung = setTimeout(() => {
      void projectsApi
        .nameVergeben(getrimmt)
        .then((belegt) => {
          if (gilt) setVergeben(belegt);
        })
        .catch(() => {
          // Ist der Server nicht erreichbar, entscheidet er beim Absenden. Hier ein
          // rotes Feld zu zeigen waere eine Behauptung ohne Grundlage.
          if (gilt) setVergeben(false);
        })
        .finally(() => {
          if (gilt) setPrueftName(false);
        });
    }, PAUSE);
    return () => {
      gilt = false;
      clearTimeout(kennung);
    };
  }, [getrimmt]);

  const schliessen = () => {
    setName("");
    setDatei(null);
    setFehler(null);
    setVergeben(false);
    onClose();
  };

  const absenden = async () => {
    if (getrimmt === "" || vergeben) return;

    setLaeuft(true);
    setFehler(null);
    try {
      if (datei) {
        legeDateiAb(datei, getrimmt);
        schliessen();
        void navigate("/editor");
        return;
      }
      const id = await anlegen(getrimmt, {}, "json", 1);
      schliessen();
      meldeErfolg("melden.projektAngelegt");
      onAngelegt(id);
    } catch (error) {
      // Der Namenskonflikt gehoert ans Feld, nicht nur in eine Meldung, die weggleitet.
      if (error instanceof ApiError && error.code === "projektname-vergeben") {
        setVergeben(true);
      } else {
        meldeFehler(error, "fehler.anlegen");
        setFehler(error instanceof ApiError ? error.text : (error as Error).message);
      }
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Dialog
      open={offen}
      onOpenChange={(naechster) => {
        if (!naechster && !laeuft) schliessen();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("projekte.neuTitel")}</DialogTitle>
          <DialogDescription>{t("projekte.neuText")}</DialogDescription>
        </DialogHeader>

        <label className="flex flex-col gap-2" htmlFor="projektname">
          <SectionLabel>{t("projekte.name")}</SectionLabel>
          <Input
            id="projektname"
            autoFocus
            value={name}
            aria-invalid={vergeben}
            aria-describedby={vergeben ? "projektname-fehler" : undefined}
            placeholder={t("projekte.namePlatzhalter")}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void absenden();
            }}
          />
          <span className="min-h-4 font-mono text-3xs tracking-(--tracking-fein)">
            {vergeben ? (
              <span id="projektname-fehler" role="alert" className="text-warning-text">
                {t("projekte.nameVergeben")}
              </span>
            ) : prueftName ? (
              <span className="text-foreground-faint">{t("projekte.namePruefen")}</span>
            ) : null}
          </span>
        </label>

        {/*
         * `min-w-0` am Textfeld und `shrink-0` am Knopf sind hier tragend, nicht Zierde:
         * ein Flex-Kind hat `min-width: auto` und schrumpft deshalb **nicht** unter seine
         * Inhaltsbreite. Ohne die beiden Klassen greift `truncate` nie, und ein langer
         * Dateiname wie "IDTA 02006-3-0-1_Template_Digital Nameplate.aasx" laeuft rechts
         * aus dem Dialog heraus, statt gekuerzt zu werden.
         */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => dateiRef.current?.click()}
          >
            <FolderOpen aria-hidden data-icon="inline-start" />
            {t("projekte.ausDatei")}
          </Button>
          <span
            className="min-w-0 truncate text-2xs text-foreground-faint"
            title={datei?.name ?? undefined}
          >
            {datei?.name ?? t("projekte.ohneDatei")}
          </span>
        </div>

        {fehler ? (
          <p role="alert" className="text-sm text-destructive">
            {fehler}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" disabled={laeuft} onClick={schliessen}>
            {t("projekte.abbrechen")}
          </Button>
          <Button
            disabled={laeuft || getrimmt === "" || vergeben}
            onClick={() => void absenden()}
          >
            {laeuft ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {t("projekte.anlegen")}
          </Button>
        </DialogFooter>

        <input
          ref={dateiRef}
          type="file"
          accept=".json,.xml,.aasx"
          className="hidden"
          onChange={(event) => {
            const gewaehlt = event.target.files?.[0] ?? null;
            setDatei(gewaehlt);
            // Der Dateiname als Vorschlag, aber nur solange nichts eingetippt ist. Er
            // ersetzt den Namen nicht mehr still, der ist jetzt Pflicht und eindeutig.
            if (gewaehlt && name.trim() === "") {
              setName(gewaehlt.name.replace(/\.(json|xml|aasx)$/i, ""));
            }
            event.target.value = "";
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
