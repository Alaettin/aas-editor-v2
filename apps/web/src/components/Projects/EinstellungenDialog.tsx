import { useTranslation } from "react-i18next";
import { Dialog } from "radix-ui";

import { useAssistentEinstellung } from "@/assistent/useEinstellung";
import { useAnsicht } from "@/store/ansicht";
import { ABBRECHEN, ETIKETT, INHALT, TEXT, TITEL, UEBERLAGERUNG } from "./markenDialog";

/**
 * Einstellungen vom Einstieg aus: Erscheinung, Dichte, Sprache.
 *
 * Zwillingsbauteil zu `components/Shell/SettingsDialog.tsx`, und das ist Absicht. Der
 * Unterschied **ist** die Erscheinung: der eine gehoert in die Editor-Rampe, dieser auf die
 * Markenflaeche, und Radix portalisiert beide an `document.body`. Ein gemeinsames Bauteil
 * mit Stil-Parametern waere mehr Naht als Ersparnis. Geteilt wird, worauf es ankommt: der
 * Speicher `store/ansicht.ts`.
 */

interface WahlProps {
  readonly titel: string;
  readonly optionen: readonly { wert: string; label: string }[];
  readonly gewaehlt: string;
  readonly onWahl: (wert: string) => void;
}

function Wahl({ titel, optionen, gewaehlt, onWahl }: WahlProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className={ETIKETT}>{titel}</span>
      <div role="radiogroup" aria-label={titel} className="flex gap-2">
        {optionen.map((option) => (
          <button
            key={option.wert}
            type="button"
            role="radio"
            aria-checked={gewaehlt === option.wert}
            onClick={() => onWahl(option.wert)}
            className={
              "h-(--h-einstiegsschalter) flex-1 border text-2xs transition-colors duration-(--duration-calm) " +
              (gewaehlt === option.wert
                ? "border-axon-fokus bg-axon-zeile-aktiv text-axon-schrift"
                : "border-axon-feld-rand text-axon-schrift-leise hover:border-axon-fokus hover:text-axon-schrift")
            }
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Derselbe Inhalt wie in `Shell/AssistentEinstellung.tsx`, in der Erscheinung der Marke.
 * Auch hier nur der Schluessel: das Modell waehlt man im Kopf des Assistenzfensters.
 */
function Assistent() {
  const { t } = useTranslation();
  const {
    stand,
    laeuft,
    fehler,
    offen,
    entwurf,
    setEntwurf,
    maske,
    beginneAendern,
    brichAb,
    speichereSchluessel,
    entferneSchluessel,
  } = useAssistentEinstellung();

  const KNOPF =
    "h-(--h-einstiegsschalter) border px-3 text-2xs transition-colors duration-(--duration-calm) disabled:opacity-50";

  return (
    <div className="flex flex-col gap-2.5">
      <span className={ETIKETT}>{t("assistentEinstellung.titel")}</span>
      <p className={TEXT}>{t("assistentEinstellung.beschreibung")}</p>

      {offen ? (
        <div className="flex gap-2">
          {/* Leer, auch beim Aendern: der Server gibt den Schluessel nicht heraus. */}
          <input
            type="password"
            autoComplete="off"
            value={entwurf}
            aria-label={t("assistentEinstellung.schluessel")}
            placeholder={t("assistentEinstellung.schluesselPlatzhalter")}
            onChange={(event) => setEntwurf(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void speichereSchluessel();
              if (event.key === "Escape" && stand?.gesetzt === true) brichAb();
            }}
            className="h-(--h-einstiegsschalter) min-w-0 flex-1 border border-axon-feld-rand bg-transparent px-2.5 text-2xs text-axon-schrift outline-none placeholder:text-axon-schrift-still focus:border-axon-fokus"
          />
          <button
            type="button"
            disabled={laeuft || entwurf.trim() === ""}
            onClick={() => void speichereSchluessel()}
            className={`${KNOPF} border-axon-fokus text-axon-schrift`}
          >
            {t("assistentEinstellung.sichern")}
          </button>
          {stand?.gesetzt === true && (
            <button
              type="button"
              disabled={laeuft}
              onClick={brichAb}
              className={`${KNOPF} border-axon-feld-rand text-axon-schrift-leise hover:text-axon-schrift`}
            >
              {t("assistentEinstellung.abbrechen")}
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-2xs text-axon-schrift">{t("assistentEinstellung.schluessel")}</span>
          <span className="ml-auto font-mono text-2xs text-axon-schrift-leise">{maske}</span>
          <button
            type="button"
            disabled={laeuft}
            onClick={beginneAendern}
            className={`${KNOPF} border-axon-feld-rand text-axon-schrift-leise hover:text-axon-schrift`}
          >
            {t("assistentEinstellung.aendern")}
          </button>
          <button
            type="button"
            disabled={laeuft}
            aria-label={t("assistentEinstellung.entfernen")}
            onClick={() => void entferneSchluessel()}
            className="px-1 text-2xs text-axon-schrift-leise hover:text-axon-schrift"
          >
            ✕
          </button>
        </div>
      )}

      {fehler !== null && <p className="text-2xs text-axon-warn">{fehler}</p>}
    </div>
  );
}

export function EinstellungenDialog({
  offen,
  onClose,
}: {
  readonly offen: boolean;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const density = useAnsicht((state) => state.density);
  const setDensity = useAnsicht((state) => state.setDensity);

  return (
    <Dialog.Root open={offen} onOpenChange={(naechster) => !naechster && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={UEBERLAGERUNG} />
        <Dialog.Content className={INHALT}>
          <Dialog.Title className={TITEL}>{t("projekte.einstellungen")}</Dialog.Title>
          {/*
            Der Hinweis muss sein: Erscheinung und Dichte gelten fuer den Editor, nicht fuer
            diese Flaeche. Sonst klickt man einmal auf "Dunkel", sieht hier nichts und haelt
            es fuer kaputt.
          */}
          <Dialog.Description className={TEXT}>
            {t("projekte.einstellungenHinweis")}
          </Dialog.Description>

          <Wahl
            titel={t("app.dichte")}
            optionen={[
              { wert: "compact", label: t("app.dichteKompakt") },
              { wert: "cozy", label: t("app.dichteKomfortabel") },
            ]}
            gewaehlt={density}
            onWahl={(wert) => setDensity(wert as "compact" | "cozy")}
          />

          {/*
            Keine Sprachwahl mehr: sie steht unten in der Seitenleiste dieses Einstiegs,
            auf der Anmeldung und im Editor in der Befehlspalette. Eine vierte Stelle fuer
            dieselbe Sache haette nur die Frage aufgeworfen, welche davon gilt.
          */}
          <Assistent />

          <div className="flex justify-end">
            <Dialog.Close className={ABBRECHEN}>{t("projekte.schliessen")}</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
