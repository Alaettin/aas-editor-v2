import type { JsonObject } from "../model/json.js";

/**
 * Upgrade von Metamodell 3.0 nach 3.1.
 *
 * Der Diff steht in `docs/metamodell-diff-3.0-3.1.md` und wurde aus den beiden generierten
 * SDKs abgeleitet, nicht aus Fliesstext. Ergebnis: der Abstand ist rein additiv. Klassen
 * und Eigenschaften sind identisch, 3.1 ergaenzt lediglich `AssetKind.Role` und laesst zwei
 * Constraints fallen. Ein 3.0-Bestand ist damit strukturell schon 3.1-gueltig.
 *
 * Konkret zu tun ist deshalb genau eines: der XML-Namensraum muss getauscht werden, sonst
 * lehnt die 3.1-SDK das Dokument ab. Fuer JSON ist nichts zu tun.
 */

export const NAMESPACE_30 = "https://admin-shell.io/aas/3/0";
export const NAMESPACE_31 = "https://admin-shell.io/aas/3/1";

export interface UpgradeNote {
  /** Zeile der Diff-Tabelle, auf die sich die Anmerkung bezieht */
  readonly rule: string;
  /** i18n-Schluessel des Hinweises */
  readonly schluessel: string;
  readonly werte: Readonly<Record<string, string>>;
}

export interface UpgradeResult<T> {
  readonly value: T;
  /** Was beim Upgrade auffiel. Leer heisst: nichts zu berichten, nicht "ungeprueft". */
  readonly notes: readonly UpgradeNote[];
}

/**
 * JSON-Upgrade. Laut Zeile 1 bis 3 der Diff-Tabelle ist hier nichts umzubauen.
 * Die Funktion existiert trotzdem, damit ein spaeterer Sprung auf 3.2 genau eine
 * Stelle hat, an der er ansetzt.
 */
export function upgradeJson<T extends JsonObject | object>(environment: T): UpgradeResult<T> {
  return { value: environment, notes: [] };
}

/**
 * XML-Upgrade: Namensraum 3/0 durch 3/1 ersetzen (Zeile 7 der Diff-Tabelle).
 *
 * Ersetzt wird nur der Namensraum als Zeichenkette. Element- und Attributnamen bleiben
 * unangetastet, weil sie in beiden Fassungen aus denselben Klassen- und
 * Eigenschaftsnamen erzeugt werden (Zeile 1 und 2).
 */
export function upgradeXml(xml: string): UpgradeResult<string> {
  if (!xml.includes(NAMESPACE_30)) {
    return { value: xml, notes: [] };
  }

  return {
    value: xml.split(NAMESPACE_30).join(NAMESPACE_31),
    notes: [
      {
        rule: "7",
        schluessel: "warnung.namensraumGehoben",
        werte: { von: NAMESPACE_30, nach: NAMESPACE_31 },
      },
    ],
  };
}

/** Erkennt die Metamodell-Version eines XML-Dokuments am Namensraum. */
export function detectXmlVersion(xml: string): "3.0" | "3.1" | "unbekannt" {
  if (xml.includes(NAMESPACE_31)) return "3.1";
  if (xml.includes(NAMESPACE_30)) return "3.0";
  return "unbekannt";
}
