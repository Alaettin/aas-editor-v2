import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

import { useAssistentEinstellung } from "@/assistent/useEinstellung";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";

/**
 * Der Schluessel des Assistenten, in der Erscheinung des Editors.
 *
 * Zwei Zustaende statt drei Bloecke. Liegt ein Schluessel, steht **eine** Zeile da: die
 * Maske, ein Knopf zum Aendern, ein Kreuz zum Entfernen. Erst auf Aendern klappt das Feld
 * an derselben Stelle auf.
 *
 * Das Feld ist dabei leer, nicht mit dem alten Wert gefuellt: der Server gibt den
 * Schluessel nicht heraus, und ein Feld, das ihn zeigte, waere der Weg, auf dem er in ein
 * Bildschirmfoto geraet.
 *
 * Das Modell steht hier bewusst nicht, es sitzt im Kopf des Assistenzfensters. Hier
 * bleibt, was man einmal einrichtet und dann vergisst.
 */
export function AssistentEinstellungAbschnitt() {
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

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>{t("assistentEinstellung.titel")}</SectionLabel>
      <p className="text-2xs text-foreground-faint">{t("assistentEinstellung.beschreibung")}</p>

      {offen ? (
        <div className="flex gap-2">
          <input
            type="password"
            autoFocus
            autoComplete="off"
            value={entwurf}
            aria-label={t("assistentEinstellung.schluessel")}
            placeholder={t("assistentEinstellung.schluesselPlatzhalter")}
            onChange={(event) => setEntwurf(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void speichereSchluessel();
              if (event.key === "Escape" && stand?.gesetzt === true) brichAb();
            }}
            className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm outline-none placeholder:text-foreground-faint"
          />
          <Button
            size="sm"
            disabled={laeuft || entwurf.trim() === ""}
            onClick={() => void speichereSchluessel()}
          >
            {t("assistentEinstellung.sichern")}
          </Button>
          {/* Abbrechen nur, wenn es etwas gibt, wohin man zurueckkehren kann. */}
          {stand?.gesetzt === true && (
            <Button variant="outline" size="sm" disabled={laeuft} onClick={brichAb}>
              {t("assistentEinstellung.abbrechen")}
            </Button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm text-secondary-foreground">
            {t("assistentEinstellung.schluessel")}
          </span>
          <span className="ml-auto font-mono text-2xs text-foreground-faint">{maske}</span>
          <Button variant="outline" size="sm" disabled={laeuft} onClick={beginneAendern}>
            {t("assistentEinstellung.aendern")}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={laeuft}
            aria-label={t("assistentEinstellung.entfernen")}
            onClick={() => void entferneSchluessel()}
          >
            <X />
          </Button>
        </div>
      )}

      {fehler !== null && <p className="text-2xs text-destructive">{fehler}</p>}
    </div>
  );
}
