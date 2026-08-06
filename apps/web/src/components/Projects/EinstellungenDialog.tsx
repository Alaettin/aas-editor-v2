import { useTranslation } from "react-i18next";
import { Dialog } from "radix-ui";

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

export function EinstellungenDialog({
  offen,
  onClose,
}: {
  readonly offen: boolean;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const theme = useAnsicht((state) => state.theme);
  const density = useAnsicht((state) => state.density);
  const language = useAnsicht((state) => state.language);
  const setTheme = useAnsicht((state) => state.setTheme);
  const setDensity = useAnsicht((state) => state.setDensity);
  const setLanguage = useAnsicht((state) => state.setLanguage);

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
            titel={t("app.erscheinung")}
            optionen={[
              { wert: "light", label: t("app.hell") },
              { wert: "dark", label: t("app.dunkel") },
            ]}
            gewaehlt={theme}
            onWahl={(wert) => setTheme(wert as "light" | "dark")}
          />

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
            Die Sprachnamen stehen in ihrer eigenen Sprache: wer die Oberflaeche gerade
            nicht lesen kann, findet so trotzdem den Weg zurueck.
          */}
          <Wahl
            titel={t("app.sprache")}
            optionen={[
              { wert: "de", label: t("app.deutsch") },
              { wert: "en", label: t("app.englisch") },
            ]}
            gewaehlt={language}
            onWahl={(wert) => setLanguage(wert as "de" | "en")}
          />

          <div className="flex justify-end">
            <Dialog.Close className={ABBRECHEN}>{t("projekte.schliessen")}</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
