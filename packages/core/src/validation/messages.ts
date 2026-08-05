/**
 * Verstaendliche Fassungen der Validierungsmeldungen (Plan Abschnitt 7).
 *
 * Die SDK formuliert ihre Meldungen als Spezifikationstext auf Englisch. Der Editor zeigt
 * stattdessen einen kurzen Satz, der sagt, **was zu tun ist**, und haelt die Rohmeldung
 * zum Aufklappen bereit.
 *
 * Dieses Modul liefert dafuer einen **i18n-Schluessel**, keinen fertigen Satz. Bis
 * Phase 9 standen die deutschen Saetze hier; die Begruendung war, dass es Fachwissen
 * ueber das Metamodell ist und das Backend dasselbe braucht. Das stimmt weiterhin, nur
 * ist der Schluessel dieses Fachwissen und nicht der deutsche Satz. Die Saetze stehen
 * jetzt unter `befund.regel.*` und `befund.muster.*` in den Uebersetzungsdateien.
 *
 * Die Pruefkette ist zweiteilig und bleibt es:
 *   - `test/messages.test.ts` prueft **SDK gegen Kern**: jede Constraint-Kennung der
 *     `verification.js` hat hier einen Schluessel, und keiner ist ueberzaehlig.
 *   - `apps/web/test/i18n.test.ts` prueft **Kern gegen Uebersetzung**: jeder Schluessel
 *     aus `ALLE_BEFUND_SCHLUESSEL` steht in jeder Sprachdatei.
 */

import type { Werte } from "../fehler.js";

export interface Explanation {
  /**
   * i18n-Schluessel, etwa `befund.regel.AASd-131` oder `befund.muster.leereListe`.
   * `null` heisst: keine Uebersetzung gefunden, dann gilt `raw`. Eine erfundene
   * Uebersetzung waere schlechter als keine.
   */
  readonly schluessel: string | null;
  /** Werte fuer die Interpolation, aus der SDK-Meldung gezogen */
  readonly werte: Werte;
  /** Constraint-Kennung, sofern die Meldung eine traegt */
  readonly constraintId: string | null;
  /** Unveraenderte Meldung der SDK, bleibt aufklappbar. Immer englisch. */
  readonly raw: string;
}

const CONSTRAINT_PATTERN = /\b(AAS[dc]-[0-9A-Za-z-]+)\b/;

/**
 * Die Constraint-Kennungen, zu denen es eine Uebersetzung gibt.
 *
 * Reine Liste, kein Text: der Text steht in den Sprachdateien unter
 * `befund.regel.<Kennung>`.
 */
export const CONSTRAINT_IDS: readonly string[] = [
  "AASc-002",
  "AASc-3a-004",
  "AASc-3a-005",
  "AASc-3a-006",
  "AASc-3a-007",
  "AASc-3a-008",
  "AASc-3a-009",
  "AASc-3a-010",
  "AASd-005",
  "AASd-014",
  "AASd-020",
  "AASd-021",
  "AASd-022",
  "AASd-077",
  "AASd-107",
  "AASd-108",
  "AASd-109",
  "AASd-114",
  "AASd-116",
  "AASd-117",
  "AASd-118",
  "AASd-119",
  "AASd-121",
  "AASd-122",
  "AASd-123",
  "AASd-124",
  "AASd-125",
  "AASd-126",
  "AASd-127",
  "AASd-128",
  "AASd-129",
  "AASd-130",
  "AASd-131",
  "AASd-133",
  "AASd-134",
];

const BEKANNTE_IDS = new Set(CONSTRAINT_IDS);

/**
 * Meldungen ohne Constraint-Kennung. Die SDK erzeugt sie aus Vorlagen, deshalb reichen
 * wenige Muster. Die erste passende Regel gewinnt.
 *
 * Wo die SDK einen Feldnamen oder eine Zahl nennt, wird er als **Wert** weitergereicht
 * und nicht in einen Satz geklebt. Sonst stuende der englische Feldname an einer festen
 * Stelle im Satz, die eine Uebersetzung nicht mehr verschieben kann.
 */
const MUSTER: ReadonlyArray<{
  readonly name: string;
  readonly test: RegExp;
  readonly werte?: (match: RegExpMatchArray) => Record<string, string>;
}> = [
  {
    // Das Muster der SDK lautet ^[a-zA-Z][a-zA-Z0-9_-]*[a-zA-Z0-9_]+$. Daraus folgt mehr,
    // als der englische Text sagt: mindestens zwei Zeichen, und ein Bindestrich ist zwar
    // in der Mitte erlaubt, aber nicht am Ende.
    name: "idShortMuster",
    test: /^ID-short of Referables shall only feature/,
  },
  {
    name: "leereListe",
    test: /^(.+) must be either not set or have at least one item\.?$/,
    werte: (m) => ({ feld: m[1] ?? "" }),
  },
  {
    name: "spracheMehrfach",
    test: /^(.+) must specify unique languages\.?$/,
    werte: (m) => ({ feld: m[1] ?? "" }),
  },
  {
    name: "zuLang",
    test: /^(.+) shall have a maximum length of (\d+) characters\.?$/,
    werte: (m) => ({ feld: m[1] ?? "", laenge: m[2] ?? "" }),
  },
  {
    name: "idShortFehlt",
    test: /^ID-shorts need to be defined for all the items of (.+?)\.?$/,
    werte: (m) => ({ feld: m[1] ?? "" }),
  },
  {
    name: "idShortsUneindeutig",
    test: /^ID-shorts of the value must be unique\.?$/,
  },
  {
    name: "submodelsModelReference",
    test: /^All submodels must be model references to a submodel\.?$/,
  },
  {
    name: "derivedFromModelReference",
    test: /^Derived-from must be a model reference to an asset administration shell\.?$/,
  },
];

/**
 * Alles, was `explain()` je als Schluessel liefern kann. Die Sprachdateien werden dagegen
 * geprueft, siehe `apps/web/test/i18n.test.ts`.
 */
export const ALLE_BEFUND_SCHLUESSEL: readonly string[] = [
  ...CONSTRAINT_IDS.map((id) => `befund.regel.${id}`),
  ...MUSTER.map((regel) => `befund.muster.${regel.name}`),
];

const OHNE_WERTE: Werte = {};

/**
 * Ordnet einer SDK-Meldung einen Schluessel zu. Gelingt das nicht, ist `schluessel` null
 * und die Oberflaeche zeigt `raw`.
 */
export function explain(message: string): Explanation {
  const constraintId = CONSTRAINT_PATTERN.exec(message)?.[1] ?? null;

  if (constraintId) {
    return {
      schluessel: BEKANNTE_IDS.has(constraintId) ? `befund.regel.${constraintId}` : null,
      werte: OHNE_WERTE,
      constraintId,
      raw: message,
    };
  }

  const normalized = message.replace(/\s+/g, " ").trim();
  for (const regel of MUSTER) {
    const treffer = regel.test.exec(normalized);
    if (treffer) {
      return {
        schluessel: `befund.muster.${regel.name}`,
        werte: regel.werte?.(treffer) ?? OHNE_WERTE,
        constraintId: null,
        raw: message,
      };
    }
  }

  return { schluessel: null, werte: OHNE_WERTE, constraintId: null, raw: message };
}
