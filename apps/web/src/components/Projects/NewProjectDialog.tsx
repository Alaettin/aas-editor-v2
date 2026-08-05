import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { FolderOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { meldeErfolg, meldeFehler } from "@/lib/melden";
import { legeDateiAb } from "@/store/pendingFile";
import { useProjects } from "@/store/projects";

interface Props {
  readonly offen: boolean;
  readonly onClose: () => void;
  readonly onAngelegt: (id: string) => void;
}

/**
 * Neues Projekt, leer oder aus einer Datei.
 *
 * Die Datei wird hier **nicht** gelesen. Sie wird abgelegt und im Editor geoeffnet, weil
 * Import und Modell erst mit dem Editor geladen werden sollen.
 */
export function NewProjectDialog({ offen, onClose, onAngelegt }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const anlegen = useProjects((state) => state.anlegen);
  const inputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [datei, setDatei] = useState<File | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const schliessen = () => {
    setName("");
    setDatei(null);
    setFehler(null);
    onClose();
  };

  const absenden = async () => {
    const gewaehlt = name.trim() === "" ? (datei?.name ?? "") : name.trim();
    if (gewaehlt === "") return;

    setLaeuft(true);
    setFehler(null);
    try {
      if (datei) {
        legeDateiAb(datei, gewaehlt);
        schliessen();
        void navigate("/editor");
        return;
      }
      const id = await anlegen(gewaehlt, {}, "json", 1);
      schliessen();
      meldeErfolg("melden.projektAngelegt");
      onAngelegt(id);
    } catch (error) {
      meldeFehler(error, "fehler.anlegen");
      setFehler((error as Error).message);
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Dialog open={offen} onOpenChange={(next) => !next && schliessen()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("projekte.neuTitel")}</DialogTitle>
          <DialogDescription>{t("projekte.neuText")}</DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="projektname">{t("projekte.name")}</FieldLabel>
          <Input
            id="projektname"
            autoFocus
            value={name}
            placeholder={datei?.name ?? ""}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <FolderOpen data-icon="inline-start" />
            {t("projekte.ausDatei")}
          </Button>
          <span className="truncate text-2xs text-muted-foreground">
            {datei?.name ?? t("projekte.ohneDatei")}
          </span>
        </div>

        {fehler ? (
          <p role="alert" className="text-sm text-destructive">
            {fehler}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={schliessen}>
            {t("projekte.abbrechen")}
          </Button>
          <Button
            disabled={laeuft || (name.trim() === "" && datei === null)}
            onClick={() => void absenden()}
          >
            {t("projekte.anlegen")}
          </Button>
        </DialogFooter>

        <input
          ref={inputRef}
          type="file"
          accept=".json,.xml,.aasx"
          className="hidden"
          onChange={(event) => {
            const gewaehlt = event.target.files?.[0] ?? null;
            setDatei(gewaehlt);
            event.target.value = "";
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
