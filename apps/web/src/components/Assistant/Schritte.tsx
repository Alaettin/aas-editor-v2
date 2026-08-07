import { useEffect, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  Copy,
  Crosshair,
  Eye,
  PenLine,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Schritt } from "@/store/assistant";

/**
 * Was der Assistent getan hat, als Gruppe unter seiner Antwort.
 *
 * Vorher standen die Schritte als lose graue Saetze im Verlauf: zwoelf Zeilen fuer eine
 * Frage, ohne Bezug zu der Antwort, zu der sie gehoerten. Jetzt eine Zeile mit Zaehler,
 * und die Schritte selbst in der Machart der Befundliste.
 *
 * Drei Regeln halten den Zaehler ehrlich:
 * - Waehrend die Runde laeuft, steht die Gruppe offen. Man will zusehen.
 * - Fehlgeschlagene Schritte stehen **immer**, auch eingeklappt. Ein Fehlschlag hinter
 *   einem Zaehler ist genau der Fall, in dem der Nutzer nachsehen muesste.
 * - Lesend traegt sein Symbol gedaempft, schreibend im Aktionsgruen: was das Modell
 *   veraendert hat, soll man nicht suchen muessen.
 */

interface Werkzeugart {
  readonly symbol: ComponentType<{ className?: string }>;
  readonly schreibend: boolean;
}

const ARTEN: Readonly<Record<string, Werkzeugart>> = {
  modell_ueberblick: { symbol: Eye, schreibend: false },
  baum_lesen: { symbol: Eye, schreibend: false },
  element_lesen: { symbol: Eye, schreibend: false },
  befunde_lesen: { symbol: Eye, schreibend: false },
  auswahl_lesen: { symbol: Eye, schreibend: false },
  suchen: { symbol: Search, schreibend: false },
  finden: { symbol: Search, schreibend: false },
  auswaehlen: { symbol: Crosshair, schreibend: false },
  feld_setzen: { symbol: PenLine, schreibend: true },
  element_anlegen: { symbol: Plus, schreibend: true },
  teilbaum_einfuegen: { symbol: Plus, schreibend: true },
  element_loeschen: { symbol: Trash2, schreibend: true },
  element_verschieben: { symbol: ArrowRight, schreibend: true },
  element_duplizieren: { symbol: Copy, schreibend: true },
};

function Zeile({ schritt }: { readonly schritt: Schritt }) {
  const art = ARTEN[schritt.werkzeug];
  const Symbol = schritt.istFehler ? AlertTriangle : (art?.symbol ?? Eye);
  const farbe = schritt.istFehler
    ? "text-destructive"
    : art?.schreibend === true
      ? "text-primary"
      : "text-muted-foreground";

  return (
    <li className="flex items-start gap-2 px-1 py-0.5">
      <Symbol className={`mt-0.5 size-3.5 shrink-0 ${farbe}`} />
      <span
        className={
          "min-w-0 flex-1 text-xs " +
          (schritt.istFehler ? "text-destructive" : "text-muted-foreground")
        }
      >
        {schritt.text}
      </span>
    </li>
  );
}

export function Schritte({
  schritte,
  laeuft,
}: {
  readonly schritte: readonly Schritt[];
  readonly laeuft: boolean;
}) {
  const { t } = useTranslation();
  const [offen, setOffen] = useState(laeuft);

  // Ist die Runde fertig, faellt die Gruppe zu. Danach entscheidet der Nutzer.
  useEffect(() => {
    if (!laeuft) setOffen(false);
  }, [laeuft]);

  if (schritte.length === 0) return null;

  const gescheitert = schritte.filter((schritt) => schritt.istFehler);

  return (
    <div className="mt-2.5 border-t border-border-subtle pt-2">
      <Collapsible open={offen} onOpenChange={setOffen}>
        <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-2xs text-foreground-faint transition-colors duration-(--duration-quick) hover:text-muted-foreground">
          <ChevronDown className="size-3 transition-transform duration-(--duration-quick) group-data-[state=closed]:-rotate-90" />
          <span data-schritte-zaehler>
            {t("assistent.schritte", { count: schritte.length })}
          </span>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <ul className="mt-1">
            {schritte.map((schritt, i) => (
              <Zeile key={i} schritt={schritt} />
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>

      {/* Zugeklappt bleiben die Fehlschlaege stehen, sonst versteckt der Zaehler sie. */}
      {!offen && gescheitert.length > 0 && (
        <ul className="mt-1">
          {gescheitert.map((schritt, i) => (
            <Zeile key={i} schritt={schritt} />
          ))}
        </ul>
      )}
    </div>
  );
}
