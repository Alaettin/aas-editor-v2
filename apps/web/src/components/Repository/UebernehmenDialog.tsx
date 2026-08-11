import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Loader2 } from "lucide-react";

import { ApiError } from "@/api/client";
import { projectsApi, type ProjectSummary, type SubmodelUebersicht } from "@/api/projects";
import { repositoryApi } from "@/api/repository";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SectionLabel } from "@/components/ui/section-label";
import { meldeErfolg, meldeFehler } from "@/lib/melden";
import { useRepository } from "@/store/repository";

/**
 * Teilmodelle aus einem eigenen Projekt uebernehmen.
 *
 * Zwei Spalten: links das Projekt, rechts seine Teilmodelle. **Nur Teilmodelle**, nie eine
 * ganze Schale; die gibt es hier gar nicht zu waehlen, und der Server kennt auch keinen
 * Weg dafuer.
 *
 * Die Rueckfrage beim Ueberschreiben ist der Kern dieses Dialogs. Der Server antwortet mit
 * 409, sobald die id schon im Repository steht, und diese Antwort wird **je Zeile** stehen
 * gelassen statt den ganzen Vorgang abzubrechen: wer fuenf Teilmodelle waehlt und bei einem
 * eine Kollision hat, soll die anderen vier trotzdem drin haben.
 *
 * Die Teilmodell-Liste kommt aus `/uebersicht`, nicht aus der Detailroute: die lieferte das
 * ganze Environment, also bei einem grossen Modell einige Megabyte fuer eine Handvoll Namen.
 */

/** Was mit einer gewaehlten Zeile beim Absenden geschehen ist. */
type Ausgang =
  | { art: "fertig" }
  | { art: "kollision"; seit: number; projekt: string }
  | { art: "fehler"; text: string };

interface Props {
  readonly offen: boolean;
  readonly onClose: () => void;
}

export function UebernehmenDialog({ offen, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const laden = useRepository((state) => state.laden);

  const [projekte, setProjekte] = useState<readonly ProjectSummary[]>([]);
  const [projektId, setProjektId] = useState<string | null>(null);
  const [teilmodelle, setTeilmodelle] = useState<readonly SubmodelUebersicht[]>([]);
  const [laedtProjekte, setLaedtProjekte] = useState(false);
  const [laedtTeilmodelle, setLaedtTeilmodelle] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<readonly string[]>([]);
  const [ausgaenge, setAusgaenge] = useState<Record<string, Ausgang>>({});
  const [laeuft, setLaeuft] = useState(false);

  const datum = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" });

  // Beim Oeffnen frisch anfangen. Ein Dialog, der den Stand des letzten Males zeigt, laesst
  // eine Kollisionsmeldung von vorhin wie eine neue aussehen.
  useEffect(() => {
    if (!offen) return;
    setProjektId(null);
    setTeilmodelle([]);
    setGewaehlt([]);
    setAusgaenge({});
    setLaedtProjekte(true);
    projectsApi
      .list({ limit: 50, offset: 0, q: "", sort: "updatedAt", dir: "desc" })
      .then((seite) => setProjekte(seite.items))
      .catch((fehler: unknown) => meldeFehler(fehler))
      .finally(() => setLaedtProjekte(false));
  }, [offen]);

  const waehleProjekt = (id: string) => {
    setProjektId(id);
    setTeilmodelle([]);
    setGewaehlt([]);
    setAusgaenge({});
    setLaedtTeilmodelle(true);
    projectsApi
      .uebersicht(id)
      .then((uebersicht) => setTeilmodelle(uebersicht.submodelle))
      .catch((fehler: unknown) => meldeFehler(fehler))
      .finally(() => setLaedtTeilmodelle(false));
  };

  const schalte = (id: string) => {
    setGewaehlt((vorher) =>
      vorher.includes(id) ? vorher.filter((eintrag) => eintrag !== id) : [...vorher, id],
    );
    // Ein Ausgang gehoert zum letzten Absenden. Wer die Auswahl aendert, sieht sonst eine
    // Meldung zu einer Zeile, die gerade gar nicht mehr gemeint ist.
    setAusgaenge((vorher) => {
      const { [id]: _weg, ...rest } = vorher;
      return rest;
    });
  };

  /** Eine Zeile uebernehmen und ihren Ausgang festhalten. Wirft nicht. */
  const uebernimmEine = async (submodelId: string, ueberschreiben: boolean): Promise<boolean> => {
    if (projektId === null) return false;
    try {
      await repositoryApi.uebernehmen(projektId, submodelId, ueberschreiben);
      setAusgaenge((vorher) => ({ ...vorher, [submodelId]: { art: "fertig" } }));
      return true;
    } catch (fehler) {
      if (fehler instanceof ApiError && fehler.code === "submodel-schon-im-repo") {
        setAusgaenge((vorher) => ({
          ...vorher,
          [submodelId]: {
            art: "kollision",
            seit: Number(fehler.details["uebernommenAm"] ?? 0),
            projekt: String(fehler.details["herkunftProjektName"] ?? ""),
          },
        }));
        return false;
      }
      const text = fehler instanceof ApiError ? fehler.text : String(fehler);
      setAusgaenge((vorher) => ({ ...vorher, [submodelId]: { art: "fehler", text } }));
      return false;
    }
  };

  const absenden = async () => {
    setLaeuft(true);
    setAusgaenge({});
    try {
      let uebernommen = 0;
      // Nacheinander, nicht gleichzeitig: der Ertrag waere eine Zehntelsekunde, der Preis
      // eine Reihenfolge der Meldungen, die bei jedem Lauf anders ist.
      for (const id of gewaehlt) {
        if (await uebernimmEine(id, false)) uebernommen += 1;
      }
      await laden();
      if (uebernommen > 0) meldeErfolg("repository.uebernommen", { count: uebernommen });
    } finally {
      setLaeuft(false);
    }
  };

  const ueberschreibe = async (submodelId: string) => {
    setLaeuft(true);
    try {
      if (await uebernimmEine(submodelId, true)) {
        await laden();
        meldeErfolg("repository.ueberschrieben");
      }
    } finally {
      setLaeuft(false);
    }
  };

  // Abgeleitet, nicht mitgefuehrt: sonst gaebe es zwei Wahrheiten darueber, ob noch etwas
  // offen ist.
  const offeneKollisionen = gewaehlt.filter((id) => ausgaenge[id]?.art === "kollision");
  const alleFertig =
    gewaehlt.length > 0 && gewaehlt.every((id) => ausgaenge[id]?.art === "fertig");

  return (
    <Dialog
      open={offen}
      onOpenChange={(istOffen) => {
        if (!istOffen && !laeuft) onClose();
      }}
    >
      {/*
        `sm:` ist kein Zierrat: `dialog.tsx` deckelt sich selbst auf `sm:max-w-sm`, und ein
        unqualifiziertes `max-w-` steht in einer anderen Variante und verliert deshalb ab
        640 px gegen den Standardwert. Der Dialog blieb dadurch schmal, obwohl die Breite
        dranstand.
      */}
      <DialogContent className="sm:max-w-(--w-uebernahmedialog)">
        <DialogHeader>
          <DialogTitle>{t("repository.uebernehmenTitel")}</DialogTitle>
          <DialogDescription>{t("repository.uebernehmenText")}</DialogDescription>
        </DialogHeader>

        {/*
          `minmax(0, ...)` statt `1fr`: eine Rasterspalte faellt sonst nicht unter ihre
          Inhaltsbreite. Ein langer Projektname wie
          "WILSEN_sonic_level_WS-UC7000-F406-B41-01-02" schob die linke Spalte auf und
          drueckte die rechte auf eine Handbreit zusammen, trotz `truncate`.
        */}
        <div className="grid h-(--h-uebernahmeliste) grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-4">
          <div className="flex min-h-0 flex-col gap-2">
            <SectionLabel>{t("repository.projektWaehlen")}</SectionLabel>
            {laedtProjekte ? (
              <Loader2 aria-hidden className="size-4 animate-spin text-foreground-faint" />
            ) : projekte.length === 0 ? (
              <p className="text-2xs text-foreground-faint">{t("repository.keineProjekte")}</p>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto">
                {projekte.map((projekt) => (
                  <li key={projekt.id}>
                    <button
                      type="button"
                      aria-pressed={projektId === projekt.id}
                      onClick={() => waehleProjekt(projekt.id)}
                      className={
                        "flex w-full items-center justify-between gap-2 rounded-(--radius-sm) px-2 py-1.5 text-left transition-colors duration-(--duration-quick) " +
                        (projektId === projekt.id
                          ? "bg-selected text-selected-foreground"
                          : "hover:bg-muted")
                      }
                    >
                      <span className="min-w-0 truncate text-sm">{projekt.name}</span>
                      <span
                        className="shrink-0 font-mono text-3xs text-mono-foreground"
                        data-numeric
                      >
                        {projekt.submodelCount}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex min-h-0 flex-col gap-2">
            <SectionLabel>{t("repository.teilmodelleWaehlen")}</SectionLabel>
            {projektId === null ? (
              <p className="text-2xs text-foreground-faint">{t("repository.erstProjekt")}</p>
            ) : laedtTeilmodelle ? (
              <Loader2 aria-hidden className="size-4 animate-spin text-foreground-faint" />
            ) : teilmodelle.length === 0 ? (
              <p className="text-2xs text-foreground-faint">{t("projekte.ohneSubmodelle")}</p>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto">
                {teilmodelle.map((submodel) => {
                  const ausgang = ausgaenge[submodel.id];
                  return (
                    <li
                      key={submodel.id}
                      className="flex flex-col gap-1 border-b border-border-row py-2"
                    >
                      <label className="flex cursor-pointer items-center gap-2.5">
                        <Checkbox
                          checked={gewaehlt.includes(submodel.id)}
                          onCheckedChange={() => schalte(submodel.id)}
                          disabled={laeuft}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">
                            {submodel.idShort ?? t("projekte.ohneIdShort")}
                          </span>
                          <span
                            className="block truncate font-mono text-3xs text-foreground-faint"
                            title={submodel.id}
                          >
                            {submodel.id}
                          </span>
                        </span>
                        {ausgang?.art === "fertig" ? (
                          <Check aria-hidden className="size-3.5 shrink-0 text-ring" />
                        ) : null}
                      </label>

                      {ausgang?.art === "kollision" ? (
                        <div className="flex items-start gap-2 rounded-(--radius-sm) bg-warning-muted px-2 py-1.5">
                          <AlertTriangle
                            aria-hidden
                            className="mt-0.5 size-3.5 shrink-0 text-warning-text"
                          />
                          <p className="min-w-0 flex-1 text-3xs text-warning-text">
                            {t("repository.stehtSchonDrin", {
                              seit: ausgang.seit === 0 ? "?" : datum.format(ausgang.seit),
                              projekt: ausgang.projekt,
                            })}
                          </p>
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={laeuft}
                            onClick={() => void ueberschreibe(submodel.id)}
                          >
                            {t("repository.ueberschreiben")}
                          </Button>
                        </div>
                      ) : null}

                      {ausgang?.art === "fehler" ? (
                        <p role="alert" className="text-3xs text-destructive">
                          {ausgang.text}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={laeuft} onClick={onClose}>
            {t("projekte.abbrechen")}
          </Button>
          <Button
            disabled={laeuft || gewaehlt.length === 0 || alleFertig || offeneKollisionen.length > 0}
            onClick={() => void absenden()}
          >
            {laeuft ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {t("repository.uebernehmenAnzahl", { count: gewaehlt.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
