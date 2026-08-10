import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, MessageSquare, SendHorizontal, Square, Trash2, X } from "lucide-react";

import { einstellungApi, type AssistentEinstellung } from "@/api/assistent";
import { Button } from "@/components/ui/button";
import { Chip, chipVariants } from "@/components/ui/chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useAssistant } from "@/store/assistant";
import { useEditor } from "@/store/editor";
import { labelOf } from "@/store/rows";
import { Schritte } from "./Schritte";
import { AssistentText } from "./Text";

/**
 * Der Assistent, angebunden.
 *
 * Was aus der Huellen-Zeit bleibt: **es wird nichts vorgetaeuscht.** Ohne hinterlegten
 * Schluessel steht weiterhin "nicht verbunden" im Kopf, das Eingabefeld ist gesperrt, und
 * es gibt keinen Beispielverlauf mehr, der wie eine Antwort aussieht.
 *
 * Je Frage eine Karte: oben die Antwort, darunter durch eine Haarlinie getrennt, was
 * dafuer getan wurde. Die Schritte sind kein Schmuck, der Assistent aendert das Modell
 * unmittelbar, und der Nutzer muss sehen, was geschehen ist, um es mit Strg+Z
 * zurueckzunehmen.
 *
 * Keine Sprechblasen: alle Radien im System enden bei 2px, eine Blase waere ein Kasten,
 * der etwas verspricht, das die Gestaltung nicht einloest. Die eigene Zeile sitzt auf der
 * ruhigen Zweitflaeche, nicht auf dem Aktionsgruen; sie ist die Frage, nicht das Ergebnis.
 */

export function AssistantPanel() {
  const { t } = useTranslation();
  const schliessen = useAssistant((state) => state.umschalten);
  const nachrichten = useAssistant((state) => state.nachrichten);
  const laeuft = useAssistant((state) => state.laeuft);
  const verbrauch = useAssistant((state) => state.verbrauch);
  const fragen = useAssistant((state) => state.fragen);
  const abbrechen = useAssistant((state) => state.abbrechen);
  const leeren = useAssistant((state) => state.leeren);

  const model = useEditor((state) => state.model);
  const selection = useEditor((state) => state.selection);

  const [einstellung, setEinstellung] = useState<AssistentEinstellung | null>(null);
  const [erreichbar, setErreichbar] = useState(true);
  const [entwurf, setEntwurf] = useState("");
  const ende = useRef<HTMLDivElement>(null);
  const feld = useRef<HTMLTextAreaElement>(null);

  // Das Textfeld waechst mit dem Inhalt: erst zuruecksetzen, dann auf die Fuellhoehe.
  useEffect(() => {
    const element = feld.current;
    if (element === null) return;
    element.style.height = "auto";
    element.style.height = `${String(element.scrollHeight)}px`;
  }, [entwurf]);

  // Einmal beim Oeffnen: liegt ein Schluessel, welches Modell ist eingestellt, und
  // welche stehen zur Wahl.
  useEffect(() => {
    let abgemeldet = false;
    void einstellungApi
      .lesen()
      .then((gelesen) => {
        if (!abgemeldet) setEinstellung(gelesen);
      })
      .catch(() => {
        if (!abgemeldet) setErreichbar(false);
      });
    return () => {
      abgemeldet = true;
    };
  }, []);

  const waehleModell = (modell: string) => {
    // Erst zeigen, dann bestaetigen lassen: der Schalter soll nicht auf die Antwort des
    // Servers warten. Scheitert es, zieht die Antwort den Namen wieder zurecht.
    setEinstellung((vorher) => (vorher === null ? vorher : { ...vorher, modell }));
    void einstellungApi
      .setzen({ modell })
      .then(setEinstellung)
      .catch(() => setErreichbar(false));
  };

  useEffect(() => {
    ende.current?.scrollIntoView({ block: "end" });
  }, [nachrichten]);

  const knoten = model && selection ? model.nodes[selection] : undefined;
  const kontext = knoten ? labelOf(knoten) : t("assistent.ohneKontext");
  const verbunden = erreichbar && einstellung?.gesetzt === true;
  const gesperrt = !verbunden || model === null;

  const absenden = () => {
    if (gesperrt || laeuft) return;
    const text = entwurf.trim();
    if (text === "") return;
    setEntwurf("");
    void fragen(text);
  };

  return (
    <aside
      data-assistant
      className="flex w-90 shrink-0 flex-col border-l border-border bg-muted"
      aria-label={t("assistent.titel")}
    >
      <header className="flex h-(--h-chat-header) shrink-0 items-center gap-2 border-b border-border-subtle px-3.5">
        <MessageSquare className="size-3.5 text-muted-foreground" />
        {/* Wie jede andere Panelkopfzeile im Editor, siehe Issues/IssuePanel.tsx. */}
        <span className="text-xs font-medium text-foreground">{t("assistent.titel")}</span>
        {verbunden && einstellung !== null ? (
          /*
           * Der Chip ist selbst der Schalter. `Chip` rendert ein <span> und kennt kein
           * asChild, deshalb traegt ein Button dessen Aussehen ueber `chipVariants`.
           */
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={laeuft}
                data-assistant-status
                aria-label={t("assistent.modellWaehlen")}
                className={`${chipVariants({ tone: "aas" })} cursor-pointer disabled:cursor-default disabled:opacity-60`}
              >
                {einstellung.modell}
              </button>
            </DropdownMenuTrigger>
            {/*
              w-auto loest die Breite vom schmalen Ausloeser, und overflow-y-auto statt
              overflow-auto, sonst raeumt tailwind-merge das overflow-x-hidden der
              Grundklasse weg und das Menue scrollt auch zur Seite.
            */}
            <DropdownMenuContent align="start" className="w-auto min-w-56 overflow-y-auto">
              <DropdownMenuRadioGroup value={einstellung.modell} onValueChange={waehleModell}>
                {einstellung.modelle.map((eintrag) => (
                  <DropdownMenuRadioItem key={eintrag.id} value={eintrag.id}>
                    <span className="flex flex-col">
                      <span>{eintrag.id}</span>
                      <span className="text-2xs text-foreground-faint">
                        {t("assistentEinstellung.preis", {
                          eingabe: eintrag.eingabe,
                          ausgabe: eintrag.ausgabe,
                        })}
                      </span>
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Chip tone="warn" data-assistant-status>
            {t("assistent.nichtVerbunden")}
          </Chip>
        )}
        <span className="ml-auto min-w-0 truncate text-2xs text-foreground-faint">
          {t("assistent.kontext", { name: kontext })}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("assistent.leeren")}
          disabled={nachrichten.length === 0 || laeuft}
          onClick={leeren}
        >
          <Trash2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("assistent.schliessen")}
          onClick={schliessen}
        >
          <X />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3.5 text-sm">
        {!verbunden && einstellung !== null && (
          <p className="text-2xs text-foreground-faint">{t("assistent.ohneSchluessel")}</p>
        )}

        {verbunden && nachrichten.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquare />
              </EmptyMedia>
              <EmptyTitle>{t("assistent.leerTitel")}</EmptyTitle>
              <EmptyDescription>{t("assistent.leerText")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {nachrichten.map((nachricht, i) => {
          if (nachricht.art === "nutzer") {
            return (
              <div
                key={i}
                className="max-w-[85%] self-end rounded-lg bg-secondary px-3 py-2 text-secondary-foreground"
              >
                {nachricht.text}
              </div>
            );
          }
          if (nachricht.art === "fehler") {
            return (
              <p key={i} className="text-2xs text-destructive">
                {nachricht.text}
              </p>
            );
          }
          // Die Karte gehoert der Antwort: Text oben, darunter, was dafuer getan wurde.
          const letzte = i === nachrichten.length - 1;
          return (
            <div key={i} className="rounded-lg border border-border bg-card px-3.5 py-3">
              {nachricht.text !== "" && <AssistentText text={nachricht.text} />}
              {laeuft && letzte && nachricht.text === "" && (
                <span className="flex items-center gap-2 text-2xs text-foreground-faint">
                  <Loader2 aria-hidden className="size-3.5 animate-spin" />
                  {t("assistent.denkt")}
                </span>
              )}
              <Schritte schritte={nachricht.schritte} laeuft={laeuft && letzte} />
            </div>
          );
        })}
        <div ref={ende} />
      </div>

      <div className="shrink-0 p-3.5 pt-2.5">
        <div className="flex items-end gap-2 rounded-lg border border-border bg-card px-3 py-2">
          {/*
            Ein Textfeld, kein einzeiliges Eingabefeld: eine laengere Anweisung soll man
            sehen koennen, statt sie seitlich wegscrollen zu lassen. Die Hoehe waechst mit
            dem Inhalt bis fuenf Zeilen, danach scrollt das Feld.
          */}
          <textarea
            ref={feld}
            rows={1}
            value={entwurf}
            disabled={gesperrt}
            aria-label={t("assistent.titel")}
            placeholder={t("assistent.platzhalter")}
            onChange={(event) => setEntwurf(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                absenden();
              }
            }}
            className="max-h-[7.5rem] min-w-0 flex-1 resize-none bg-transparent py-0.5 text-sm outline-none placeholder:text-foreground-faint disabled:opacity-60"
          />
          {laeuft ? (
            <Button variant="ghost" size="icon-xs" aria-label={t("assistent.abbrechen")} onClick={abbrechen}>
              <Square />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("assistent.senden")}
              disabled={gesperrt || entwurf.trim() === ""}
              onClick={absenden}
            >
              <SendHorizontal />
            </Button>
          )}
        </div>
        <p className="mt-2 text-2xs text-foreground-faint">
          {verbrauch === null
            ? t("assistent.disclaimer")
            : t("assistent.verbrauch", { eingabe: verbrauch.eingabe, ausgabe: verbrauch.ausgabe })}
        </p>
      </div>
    </aside>
  );
}
