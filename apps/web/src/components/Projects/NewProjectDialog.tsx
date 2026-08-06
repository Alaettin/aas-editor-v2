import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Dialog } from "radix-ui";
import { FolderOpen, Loader2 } from "lucide-react";

import { ApiError } from "@/api/client";
import { projectsApi } from "@/api/projects";
import { meldeErfolg, meldeFehler } from "@/lib/melden";
import { legeDateiAb } from "@/store/pendingFile";
import { useProjects } from "@/store/projects";
import {
  ABBRECHEN,
  aktionsKnopf,
  ETIKETT,
  FELD,
  INHALT,
  TEXT,
  TITEL,
  UEBERLAGERUNG,
} from "./markenDialog";

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
    <Dialog.Root
      open={offen}
      onOpenChange={(naechster) => {
        if (!naechster && !laeuft) schliessen();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={UEBERLAGERUNG} />
        <Dialog.Content className={INHALT}>
          <Dialog.Title className={TITEL}>{t("projekte.neuTitel")}</Dialog.Title>
          <Dialog.Description className={TEXT}>{t("projekte.neuText")}</Dialog.Description>

          <label className="flex flex-col gap-2.25" htmlFor="projektname">
            <span className={ETIKETT}>{t("projekte.name")}</span>
            <input
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
              className={FELD + (vergeben ? " border-axon-fehler-kraeftig" : "")}
            />
            <span className="min-h-4 font-mono text-3xs tracking-(--tracking-fein)">
              {vergeben ? (
                <span id="projektname-fehler" role="alert" className="text-axon-fehler">
                  {t("projekte.nameVergeben")}
                </span>
              ) : prueftName ? (
                <span className="text-axon-schrift-still">{t("projekte.namePruefen")}</span>
              ) : null}
            </span>
          </label>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => dateiRef.current?.click()}
              className="flex h-(--h-einstiegsschalter) items-center gap-2 border border-axon-feld-rand px-3.5 text-2xs text-axon-schrift-leise transition-colors duration-(--duration-calm) hover:border-axon-fokus hover:text-axon-schrift"
            >
              <FolderOpen aria-hidden className="size-3.5" />
              {t("projekte.ausDatei")}
            </button>
            <span className="truncate text-2xs text-axon-schrift-still">
              {datei?.name ?? t("projekte.ohneDatei")}
            </span>
          </div>

          {fehler ? (
            <p role="alert" className="text-sm text-axon-fehler">
              {fehler}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Dialog.Close disabled={laeuft} className={ABBRECHEN}>
              {t("projekte.abbrechen")}
            </Dialog.Close>
            <button
              type="button"
              disabled={laeuft || getrimmt === "" || vergeben}
              onClick={() => void absenden()}
              className={aktionsKnopf()}
            >
              {laeuft ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : null}
              {t("projekte.anlegen")}
            </button>
          </div>

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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
