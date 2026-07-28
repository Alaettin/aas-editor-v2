/**
 * Verstaendliche Fassungen der Validierungsmeldungen (Plan Abschnitt 7).
 *
 * Die SDK formuliert die Meldungen als Spezifikationstext auf Englisch. Der Editor zeigt
 * stattdessen einen kurzen deutschen Satz, der sagt, **was zu tun ist**, und haelt die
 * Rohmeldung zum Aufklappen bereit.
 *
 * Bewusst hier im Kern und nicht in der Oberflaeche: das ist Fachwissen ueber das
 * Metamodell, kein Bedienungstext. Sobald das Backend validiert, braucht es dasselbe.
 *
 * `test/messages.test.ts` liest zur Laufzeit die `verification.js` der SDK, sammelt alle
 * Constraint-Kennungen und prueft, dass jede hier steht. Kommt mit einer neuen SDK ein
 * Constraint hinzu, faellt der Test.
 */

export interface Explanation {
  /** Kurzer deutscher Satz, sagt was zu tun ist */
  readonly title: string;
  /** Constraint-Kennung, sofern die Meldung eine traegt */
  readonly constraintId: string | null;
  /** Unveraenderte Meldung der SDK, bleibt aufklappbar */
  readonly raw: string;
  /** Konnte uebersetzt werden? Sonst steht in `title` der Originaltext. */
  readonly translated: boolean;
}

const CONSTRAINT_PATTERN = /\b(AAS[dc]-[0-9A-Za-z-]+)\b/;

/** Uebersetzungen je Constraint-Kennung. */
export const CONSTRAINT_TEXTS: Readonly<Record<string, string>> = {
  "AASc-002": "Der preferredName muss mindestens auf Englisch vorliegen.",
  "AASc-3a-004":
    "Bei category PROPERTY oder VALUE ist der dataType der IEC-61360-Spezifikation Pflicht und " +
    "muss einer der Mess-, Zaehl-, Text- oder Zeittypen sein, etwa STRING oder REAL_MEASURE.",
  "AASc-3a-005": "Bei category REFERENCE muss der dataType STRING, IRI oder IRDI sein.",
  "AASc-3a-006": "Bei category DOCUMENT muss der dataType FILE, BLOB oder HTML sein.",
  "AASc-3a-007": "Bei category QUALIFIER_TYPE ist der dataType Pflicht.",
  "AASc-3a-008":
    "Eine ConceptDescription mit IEC-61360-Spezifikation braucht eine definition, mindestens " +
    "auf Englisch. Ausgenommen sind Beschreibungen, die einen Wert bezeichnen.",
  "AASc-3a-009":
    "Bei einem Mess- oder Waehrungstyp muss eine Einheit angegeben sein, entweder unit oder unitId.",
  "AASc-3a-010": "Entweder value oder valueList darf gefuellt sein, nicht beides.",

  "AASd-005": "Eine revision setzt eine version voraus. Ohne version keine revision.",
  "AASd-014":
    "Eine Entity vom Typ SelfManagedEntity braucht eine globalAssetId oder mindestens eine " +
    "specificAssetId.",
  "AASd-020": "Der Wert passt nicht zum angegebenen valueType.",
  "AASd-021": "Zwei Qualifier haben denselben type. Je type ist nur einer erlaubt.",
  "AASd-022":
    "Der idShort kommt unter denselben Geschwistern mehrfach vor. Bei Elementen, die keine " +
    "eigene id tragen, muss er eindeutig sein, Gross- und Kleinschreibung zaehlt.",
  "AASd-077": "Zwei Extensions haben denselben name. Der name muss eindeutig sein.",
  "AASd-107":
    "Die semanticId eines direkten Kindes weicht von semanticIdListElement der Liste ab. Beide " +
    "muessen uebereinstimmen.",
  "AASd-108":
    "Alle direkten Kinder der Liste muessen den Typ haben, der in typeValueListElement steht.",
  "AASd-109":
    "Steht in typeValueListElement Property oder Range, muss valueTypeListElement gesetzt sein " +
    "und alle Kinder muessen diesen valueType tragen.",
  "AASd-114": "Zwei direkte Kinder haben verschiedene semanticIds. Sie muessen identisch sein.",
  "AASd-116":
    "globalAssetId ist als name einer specificAssetId reserviert. Dann muss ihr value der " +
    "globalAssetId entsprechen.",
  "AASd-117":
    "Der idShort fehlt. Nur direkte Kinder einer SubmodelElementList duerfen ohne auskommen, " +
    "dort wird ueber den Index adressiert.",
  "AASd-118": "Es gibt supplementalSemanticIds, aber keine semanticId. Die Haupt-semanticId fehlt.",
  "AASd-119":
    "Ein Qualifier vom kind TemplateQualifier verlangt, dass das qualifizierte Element vom kind " +
    "Template ist.",
  "AASd-121":
    "Der erste Key einer Reference muss auf etwas weltweit Identifizierbares zeigen.",
  "AASd-122":
    "Bei einer ExternalReference muss der erste Key ein generischer globaler Verweis sein, etwa " +
    "GlobalReference.",
  "AASd-123":
    "Bei einer ModelReference muss der erste Key ein Identifiable sein, also " +
    "AssetAdministrationShell, Submodel oder ConceptDescription.",
  "AASd-124":
    "Bei einer ExternalReference muss der letzte Key ein generischer globaler Verweis oder ein " +
    "Fragment sein.",
  "AASd-125":
    "Bei einer ModelReference mit mehreren Keys muessen alle Keys nach dem ersten Fragment-Keys " +
    "sein.",
  "AASd-126":
    "Bei einer ModelReference darf hoechstens der letzte Key ein generisches Fragment sein.",
  "AASd-127":
    "Ein Key vom Typ FragmentReference muss auf einen Key vom Typ File oder Blob folgen.",
  "AASd-128":
    "Nach einem Key vom Typ SubmodelElementList muss der Wert des naechsten Keys eine Zahl sein, " +
    "der Index in der Liste.",
  "AASd-129":
    "Ein Qualifier vom kind TemplateQualifier ist nur in einem Submodel mit kind Template erlaubt.",
  "AASd-130": "Der Text enthaelt Zeichen, die XML nicht zulaesst, etwa Steuerzeichen.",
  "AASd-131":
    "Die AssetInformation braucht entweder eine globalAssetId oder mindestens eine specificAssetId.",
  "AASd-133": "externalSubjectId muss eine ExternalReference sein, keine ModelReference.",
  "AASd-134":
    "Die idShorts aller Ein-, Aus- und Ein-Ausgabevariablen einer Operation muessen zusammen " +
    "eindeutig sein.",
};

/**
 * Meldungen ohne Constraint-Kennung. Die SDK erzeugt sie aus Vorlagen, deshalb reichen
 * wenige Muster. Die erste passende Regel gewinnt.
 */
const PATTERNS: ReadonlyArray<{ test: RegExp; text: (match: RegExpMatchArray) => string }> = [
  {
    // Das Muster der SDK lautet ^[a-zA-Z][a-zA-Z0-9_-]*[a-zA-Z0-9_]+$. Daraus folgt mehr,
    // als der englische Text sagt: mindestens zwei Zeichen, und ein Bindestrich ist zwar
    // in der Mitte erlaubt, aber nicht am Ende.
    test: /^ID-short of Referables shall only feature/,
    text: () =>
      "Der idShort muss mit einem Buchstaben beginnen, darf sonst nur Buchstaben, Ziffern, " +
      "Unterstriche und Bindestriche enthalten, muss mindestens zwei Zeichen lang sein und " +
      "darf nicht auf einen Bindestrich enden.",
  },
  {
    test: /^(.+) must be either not set or have at least one item\.?$/,
    text: (m) => `${m[1]} ist gesetzt, aber leer. Entweder mindestens ein Eintrag oder ganz weg.`,
  },
  {
    test: /^(.+) must specify unique languages\.?$/,
    text: (m) => `${m[1]} enthaelt dieselbe Sprache mehrfach. Je Sprache ist ein Eintrag erlaubt.`,
  },
  {
    test: /^(.+) shall have a maximum length of (\d+) characters\.?$/,
    text: (m) => `${m[1]} ist zu lang, erlaubt sind hoechstens ${m[2]} Zeichen.`,
  },
  {
    test: /^ID-shorts need to be defined for all the items of (.+?)\.?$/,
    text: (m) => `Alle Eintraege von ${m[1]} brauchen einen idShort.`,
  },
  {
    test: /^ID-shorts of the value must be unique\.?$/,
    text: () => "Die idShorts innerhalb des Werts muessen eindeutig sein.",
  },
  {
    test: /^All submodels must be model references to a submodel\.?$/,
    text: () => "Jeder Verweis unter submodels muss eine ModelReference auf ein Submodel sein.",
  },
  {
    test: /^Derived-from must be a model reference to an asset administration shell\.?$/,
    text: () => "derivedFrom muss eine ModelReference auf eine AssetAdministrationShell sein.",
  },
];

/**
 * Uebersetzt eine Meldung der SDK. Gelingt das nicht, steht der Originaltext im `title`,
 * und `translated` ist false. Eine erfundene Uebersetzung waere schlechter als keine.
 */
export function explain(message: string): Explanation {
  const constraintId = CONSTRAINT_PATTERN.exec(message)?.[1] ?? null;

  if (constraintId) {
    const text = CONSTRAINT_TEXTS[constraintId];
    if (text) return { title: text, constraintId, raw: message, translated: true };
    return { title: message, constraintId, raw: message, translated: false };
  }

  const normalized = message.replace(/\s+/g, " ").trim();
  for (const rule of PATTERNS) {
    const match = rule.test.exec(normalized);
    if (match) return { title: rule.text(match), constraintId: null, raw: message, translated: true };
  }

  return { title: message, constraintId: null, raw: message, translated: false };
}
