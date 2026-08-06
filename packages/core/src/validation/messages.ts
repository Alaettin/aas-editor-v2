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

  // --- Ab hier die Regeln vom 06.08.2026 ------------------------------------------
  // Sie schliessen die einundzwanzig Vorlagen, die bis dahin englisch durchfielen. Es
  // waren ausgerechnet die alltaeglichen: falscher Wertetyp, leerer Wert, Datumsformat.
  {
    name: "wertPasstNichtZumTyp",
    test: /^The value must match the value type\.?$/,
  },
  {
    // Dieselbe Aussage, aber die SDK nennt das Feld: Value, Min und Max der Range. Zwei
    // Regeln statt einer mit optionaler Gruppe, sonst stuende im Satz eine leere Luecke.
    name: "feldPasstNichtZumTyp",
    test: /^(.+) must be consistent with the value type\.?$/,
    werte: (m) => ({ feld: m[1] ?? "" }),
  },
  {
    name: "wertLeer",
    test: /^The value must not be empty\.?$/,
  },
  {
    // Die Schwester von `leereListe`: dort heisst es "must be either not set or have",
    // hier "must contain" oder "must have". Der Unterschied ist, dass diese Listen
    // ueberhaupt nicht leer sein duerfen.
    name: "listeBrauchtEintrag",
    test: /^(.+) must (?:contain|have) at least one item\.?$/,
    werte: (m) => ({ feld: m[1] ?? "" }),
  },
  {
    name: "modelReferenceNoetig",
    test: /^(.+) must be a model reference to (?:a referable|an Event element)\.?$/,
    werte: (m) => ({ feld: m[1] ?? "" }),
  },
  {
    name: "datumMuster",
    test: /^The value must (?:match the pattern of|represent a valid) xs:dateTime with the time zone fixed to UTC\.?$/,
  },
  {
    name: "dauerMuster",
    test: /^The value must match the pattern of xs:duration\.?$/,
  },
  {
    name: "fassungMuster",
    test: /^(Revision|Version) type shall match the \w+ pattern\.?$/,
    werte: (m) => ({ feld: m[1] ?? "" }),
  },
  {
    name: "uriNoetig",
    test: /^String with max \d+ and min \d+ characters conformant to a URI as per RFC 2396\.?$/,
  },
  {
    name: "mimeNoetig",
    test: /^The value must represent a valid content MIME type according to RFC 2046\.?$/,
  },
  {
    name: "sprachmarkeNoetig",
    test: /^The value must represent a value language tag conformant to BCP 47\.?$/,
  },
  {
    name: "intervallBeiEingang",
    test: /^Max\. interval is not applicable for input direction\.?$/,
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
  const normalized = message.replace(/\s+/g, " ").trim();

  /*
   * Die Musterregeln laufen **immer**, auch wenn eine Kennung gefunden wurde. Bis zum
   * 06.08.2026 kehrte der Kennungszweig sofort zurueck und setzte `werte` fest auf leer.
   * Das fiel nur deshalb nicht auf, weil kein `befund.regel.*`-Satz einen Platzhalter
   * benutzt; der erste, der es tut, haette eine leere Luecke im Satz.
   */
  let werte: Werte = OHNE_WERTE;
  let musterSchluessel: string | null = null;
  for (const regel of MUSTER) {
    const treffer = regel.test.exec(normalized);
    if (treffer) {
      musterSchluessel = `befund.muster.${regel.name}`;
      werte = regel.werte?.(treffer) ?? OHNE_WERTE;
      break;
    }
  }

  // Die Kennung ist die genauere Aussage und geht vor: sie benennt die Regel, das Muster
  // nur die Form des Satzes.
  if (constraintId && BEKANNTE_IDS.has(constraintId)) {
    return { schluessel: `befund.regel.${constraintId}`, werte, constraintId, raw: message };
  }

  return { schluessel: musterSchluessel, werte, constraintId, raw: message };
}
