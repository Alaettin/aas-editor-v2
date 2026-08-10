import type { JsonObject, JsonValue } from "@aas-editor/core";
import contactinformation from "../../vorlagen/contactinformation-1-0-1.json" with { type: "json" };
import handoverdocumentation from "../../vorlagen/handoverdocumentation-2-0-1.json" with { type: "json" };
import nameplate from "../../vorlagen/nameplate-3-0.json" with { type: "json" };
import technicaldata from "../../vorlagen/technicaldata-2-0.json" with { type: "json" };

/**
 * Die IDTA-Teilmodellvorlagen.
 *
 * Der Grund fuer dieses Modul ist handfest: die IRDIs einer HandoverDocumentation
 * (`0173-1#01-AHF578#003` fuer das Teilmodell, `0173-1#02-ABI504#001` fuer `DigitalFile`)
 * lassen sich nicht aus dem Gedaechtnis eines Sprachmodells schoepfen. Sie gehoeren als
 * **Daten** in den Server.
 *
 * Die Dateien unter `apps/server/vorlagen/` sind unveraenderte Template-JSONs des
 * Herausgebers, siehe das README daneben. Sie werden **importiert, nicht gelesen**: ein
 * Pfad ueber `import.meta.url` loest sich im esbuild-Buendel woandershin auf als in der
 * Quelle, das hat in Phase 10 schon einmal Zeit gekostet. Ein JSON-Import buendelt mit
 * und trifft in beiden Faellen.
 *
 * Gefiltert wird erst hier, nie in der Datei. Sobald jemand in der Vorlage von Hand etwas
 * glattzieht, ist die Quelle nicht mehr die Spezifikation, sondern eine Abschrift davon.
 */

export interface VorlagenEintrag {
  readonly kennung: string;
  readonly titel: string;
  readonly idta: string;
  readonly fassung: string;
  readonly quelle: JsonObject;
}

export const KATALOG: readonly VorlagenEintrag[] = [
  {
    kennung: "nameplate-3-0",
    titel: "Digital Nameplate",
    idta: "IDTA 02006-3-0",
    fassung: "3.0",
    quelle: nameplate as unknown as JsonObject,
  },
  {
    kennung: "technicaldata-2-0",
    titel: "Technical Data",
    idta: "IDTA 02003-2-0",
    fassung: "2.0",
    quelle: technicaldata as unknown as JsonObject,
  },
  {
    kennung: "handoverdocumentation-2-0-1",
    titel: "Handover Documentation",
    idta: "IDTA 02004-2-0-1",
    fassung: "2.0.1",
    quelle: handoverdocumentation as unknown as JsonObject,
  },
  {
    kennung: "contactinformation-1-0-1",
    titel: "Contact Information",
    idta: "IDTA 02002-1-0-1",
    fassung: "1.0.1",
    quelle: contactinformation as unknown as JsonObject,
  },
];

/**
 * Fehler in den Dateien des Herausgebers, die wir bewusst **nicht** ausbessern.
 *
 * Sie werden gemeldet statt behoben: sobald jemand in der Vorlage etwas glattzieht, ist die
 * Quelle nicht mehr die Spezifikation, sondern eine Abschrift davon. Gemeldet muessen sie
 * trotzdem werden, sonst wandert eine kaputte URL unbemerkt in eine ausgelieferte AAS.
 * Aufgefallen am 10.08.2026 beim Bauen einer echten AAS.
 */
const MAENGEL: Readonly<Record<string, readonly string[]>> = {
  "technicaldata-2-0": [
    'supplementalSemanticId von TechnicalProperties: "https://api.eclass-cdp.com/ ' +
      '0173-1-02-ABK163-002" enthaelt ein Leerzeichen und ist keine gueltige URL. ' +
      "So steht es in der Datei der IDTA. Vor dem Ausliefern entfernen oder berichtigen.",
    'displayName von TechnicalProperties: "Technsiche Merkmalsbereiche", Schreibfehler ' +
      "des Herausgebers.",
  ],
};

/**
 * Elemente, deren Kinder die Vorlage schuldig bleibt, samt Fundstelle.
 *
 * `AddressInformation` im Nameplate verweist auf ein SMT-Drop-in, das beim Herausgeber
 * nicht als JSON vorliegt: weder unter `published` noch als eigener Ordner, am 10.08.2026
 * nachgesehen. Genau dort wurde in einer echten Sitzung geraten, wovor die
 * Werkzeugbeschreibung warnt. Der Verweis nennt deshalb die naechstbeste **belegte**
 * Quelle und sagt dazu, dass sie eine andere ist.
 */
const FUNDSTELLEN: Readonly<Record<string, string>> = {
  "https://admin-shell.io/zvei/nameplate/1/0/ContactInformations/AddressInformation":
    "Die Kinder definiert das SMT-Drop-in \"Address Information\". Es liegt beim " +
    "Herausgeber nicht als JSON vor. Die offiziellen Adressfelder samt IRDI stehen in " +
    "aas_vorlage(kennung=\"contactinformation-1-0-1\", pfad=\"/ContactInformation\"); sie " +
    "stammen aus IDTA 02002 und nicht aus dem Drop-in. Nicht raten.",
};

export const KENNUNGEN: readonly string[] = KATALOG.map((v) => v.kennung);

export function vorlageVon(kennung: string): VorlagenEintrag | undefined {
  return KATALOG.find((v) => v.kennung === kennung);
}

export function maengelVon(kennung: string): readonly string[] {
  return MAENGEL[kennung] ?? [];
}

/**
 * Der Qualifier, den die IDTA an nahezu jedes Element ihrer Vorlagen haengt. Er ist der
 * Grund, warum sich ein Pflicht-Geruest **ableiten** und nicht pflegen laesst.
 */
const KARDINALITAET = "SMT/Cardinality";
const PFLICHT = new Set(["One", "OneToMany"]);

/** Kindlisten, in denen weitere SubmodelElements haengen koennen. */
const KINDLISTEN = ["submodelElements", "value", "statements", "annotations"] as const;

function istObjekt(wert: JsonValue | undefined): wert is JsonObject {
  return typeof wert === "object" && wert !== null && !Array.isArray(wert);
}

/** Die `semanticId` eines Elements als schlichte Zeichenkette, leer wenn es keine gibt. */
function semantikStringVon(element: JsonObject): string {
  const semantik = element["semanticId"];
  if (!istObjekt(semantik)) return "";
  const keys = semantik["keys"];
  if (!Array.isArray(keys)) return "";
  return keys
    .filter(istObjekt)
    .map((k) => String(k["value"] ?? ""))
    .join(", ");
}

function kardinalitaetVon(element: JsonObject): string | null {
  const quals = element["qualifiers"];
  if (!Array.isArray(quals)) return null;
  for (const q of quals) {
    if (istObjekt(q) && q["type"] === KARDINALITAET && typeof q["value"] === "string") {
      return q["value"];
    }
  }
  return null;
}

export interface Geruest {
  readonly submodel: JsonObject;
  /** Wie viele Elemente weggelassen wurden, weil sie optional sind. */
  readonly weggelassen: number;
  /** Davon solche, die gar keinen Kardinalitaets-Qualifier tragen. */
  readonly ohneKardinalitaet: number;
  /**
   * Ob die Vorlage ueberhaupt Kardinalitaeten fuehrt.
   *
   * Falsch heisst: dieses Geruest ist leer, und zwar nicht weil alles optional waere,
   * sondern weil die Datei die Angabe gar nicht kennt. IDTA 02002 ContactInformation ist
   * so eine, und ein leeres Geruest ohne Erklaerung waere dort das Verwirrendste.
   */
  readonly traegtKardinalitaeten: boolean;
}

/** Ob irgendwo im Teilbaum ein Kardinalitaets-Qualifier steht. */
function irgendwoKardinalitaet(element: JsonObject): boolean {
  if (kardinalitaetVon(element) !== null) return true;
  for (const liste of KINDLISTEN) {
    const kinder = element[liste];
    if (istKindliste(kinder) && kinder.some(irgendwoKardinalitaet)) return true;
  }
  return false;
}

interface Zaehler {
  weggelassen: number;
  ohneKardinalitaet: number;
}

/**
 * Felder, die im Geruest nichts verloren haben.
 *
 * Bewusst eine **Sperrliste** und keine Positivliste. Eine Positivliste muesste jedes
 * Pflichtfeld des Metamodells kennen, und sie vergisst genau die, an die man nicht denkt:
 * `contentType` einer `File`, `entityType` einer `Entity`, `typeValueListElement` einer
 * `SubmodelElementList`. Das Ergebnis waere ein Geruest, aus dem sich gar keine Datei
 * schreiben laesst. Was nicht hier steht, bleibt stehen.
 */
const WEG = new Set([
  "qualifiers",
  "category",
  "embeddedDataSpecifications",
  "extensions",
  "administration",
  "displayName",
]);

/**
 * Ob eine Eigenschaft eine Kindliste ist oder ein Wert.
 *
 * `value` ist beides, je nach Art: bei einer Collection eine Liste von Elementen, bei
 * einer MultiLanguageProperty eine Liste von Sprachtexten **ohne** `modelType`. Genau
 * daran laesst es sich unterscheiden.
 */
function istKindliste(wert: JsonValue | undefined): wert is JsonObject[] {
  return Array.isArray(wert) && wert.every((k) => istObjekt(k) && k["modelType"] !== undefined);
}

/**
 * Ein Element der Vorlage, auf das Noetige eingedampft: ohne Beispielwert, ohne
 * Qualifier (die Kardinalitaet steht verstaendlicher als eigenes Feld) und ohne die
 * optionalen Kinder.
 */
function eindampfen(element: JsonObject, zaehler: Zaehler): JsonObject {
  const out: JsonObject = {};

  for (const [feld, wert] of Object.entries(element)) {
    if (WEG.has(feld)) continue;
    if ((KINDLISTEN as readonly string[]).includes(feld)) continue;
    out[feld] = wert;
  }

  const kard = kardinalitaetVon(element);
  if (kard !== null) out["_kardinalitaet"] = kard;
  const fundstelle = FUNDSTELLEN[semantikStringVon(element)];
  if (fundstelle !== undefined) out["_hinweis"] = fundstelle;

  for (const liste of KINDLISTEN) {
    const kinder = element[liste];
    if (!istKindliste(kinder)) {
      // Kein Kind, sondern ein Wert: der Beispielwert faellt weg, die Struktur bleibt.
      if (liste === "value" && kinder !== undefined) out["value"] = leererWert(element);
      continue;
    }
    const behalten = kinder
      .filter((kind) => {
        const k = kardinalitaetVon(kind);
        if (k === null) {
          zaehler.weggelassen += 1;
          zaehler.ohneKardinalitaet += 1;
          return false;
        }
        if (!PFLICHT.has(k)) {
          zaehler.weggelassen += 1;
          return false;
        }
        return true;
      })
      .map((kind) => eindampfen(kind, zaehler));
    out[liste] = behalten;
  }

  return out;
}

/**
 * Was an die Stelle des Beispielwerts tritt.
 *
 * Bei einer MultiLanguageProperty ist das **nicht** die leere Liste und auch nicht ein
 * leerer Text: `[]` verstiesse gegen "either not set or have at least one item", und ein
 * leerer Text gegen "The value must not be empty". Beides hat der eigene Test gefunden,
 * und beides waere ein Geruest gewesen, das die Pruefung nicht besteht.
 *
 * Es bleibt deshalb ein erkennbarer Platzhalter stehen, in den Sprachen, die die Vorlage
 * vorsieht. Ein Geruest, das durchlaeuft und sichtbar auszufuellen ist, ist mehr wert als
 * eines, das leer ist und scheitert.
 */
const PLATZHALTER = "TODO";

function leererWert(element: JsonObject): JsonValue {
  if (element["modelType"] !== "MultiLanguageProperty") return "";

  const vorhanden = element["value"];
  const sprachen = Array.isArray(vorhanden)
    ? vorhanden
        .filter(istObjekt)
        .map((eintrag) => String(eintrag["language"] ?? "de"))
        .filter((sprache, i, alle) => alle.indexOf(sprache) === i)
    : [];

  const genutzt = sprachen.length > 0 ? sprachen : ["de"];
  return genutzt.map((language) => ({ language, text: PLATZHALTER }));
}

/**
 * Das Pflicht-Geruest eines Teilmodells.
 *
 * `kind` faellt dabei von `Template` auf `Instance`: was hier herauskommt, ist der Anfang
 * einer echten AAS und keine Vorlage mehr. Die `id` bleibt die der Vorlage, damit
 * erkennbar ist, woher das Geruest stammt; sie gehoert vor dem Ausliefern ersetzt, und
 * die Werkzeugbeschreibung sagt das auch.
 */
export function pflichtGeruest(eintrag: VorlagenEintrag): Geruest {
  const erstes = submodelVon(eintrag);
  const zaehler: Zaehler = { weggelassen: 0, ohneKardinalitaet: 0 };
  const submodel = eindampfen(erstes, zaehler);
  submodel["id"] = erstes["id"] ?? "";
  submodel["kind"] = "Instance";

  return {
    submodel,
    weggelassen: zaehler.weggelassen,
    ohneKardinalitaet: zaehler.ohneKardinalitaet,
    traegtKardinalitaeten: irgendwoKardinalitaet(erstes),
  };
}

/** Die `semanticId` des Teilmodells als schlichte Zeichenkette, fuer die Uebersicht. */
export function semantikVon(eintrag: VorlagenEintrag): string {
  return istObjekt(submodelVon(eintrag)) ? semantikStringVon(submodelVon(eintrag)) : "";
}

/** Das erste Teilmodell der Vorlage. Eine Vorlage ohne eines ist eine kaputte Datei. */
function submodelVon(eintrag: VorlagenEintrag): JsonObject {
  const submodels = eintrag.quelle["submodels"];
  const erstes = Array.isArray(submodels) ? submodels[0] : undefined;
  if (!istObjekt(erstes)) {
    throw new Error(`Die Vorlage ${eintrag.kennung} enthaelt kein Submodel.`);
  }
  return erstes;
}

// --- umfang=struktur -------------------------------------------------------------------

/**
 * Was ein Bauplan braucht, und nicht mehr.
 *
 * Alles andere faellt weg: Beschreibungen, Beispielwerte, ergaenzende Semantik,
 * Qualifier. `vollstaendig` bei technicaldata-2-0 hat in einer echten Sitzung den Kontext
 * gesprengt und musste ausserhalb wieder zu einem Baum eingedampft werden. Genau diese
 * Arbeit macht diese Stufe.
 *
 * `contentType`, `entityType` und `typeValueListElement` stehen mit dabei, obwohl sie keine
 * Semantik tragen: ohne sie laesst sich aus dem Bauplan nicht ablesen, was ein Element
 * ueberhaupt aufnehmen kann.
 */
const STRUKTURFELDER = [
  "idShort",
  "modelType",
  "valueType",
  "contentType",
  "entityType",
  "typeValueListElement",
  "valueTypeListElement",
] as const;

function strukturieren(element: JsonObject): JsonObject {
  const out: JsonObject = {};
  for (const feld of STRUKTURFELDER) {
    if (element[feld] !== undefined) out[feld] = element[feld];
  }

  // Die semanticId als blosse Zeichenkette: das Objekt drumherum kostet das Vierfache und
  // sagt nichts, was hier gebraucht wird. Wer sie einsetzbar will, nimmt pflicht.
  const semantik = semantikStringVon(element);
  if (semantik !== "") out["semanticId"] = semantik;

  const kard = kardinalitaetVon(element);
  out["_kardinalitaet"] = kard ?? "ohne Angabe";
  const fundstelle = FUNDSTELLEN[semantik];
  if (fundstelle !== undefined) out["_hinweis"] = fundstelle;

  for (const liste of KINDLISTEN) {
    const kinder = element[liste];
    if (!istKindliste(kinder)) continue;
    out[liste] = kinder.map(strukturieren);
  }

  return out;
}

export function strukturGeruest(eintrag: VorlagenEintrag): JsonObject {
  return strukturieren(submodelVon(eintrag));
}

// --- pfad ------------------------------------------------------------------------------

/**
 * Schneidet ein Geruest auf einen Teilbaum zu, ueber die `idShort`-Kette.
 *
 * `/Markings` statt des ganzen Nameplates. Ohne diesen Schnitt ist `vollstaendig` bei den
 * grossen Vorlagen unbenutzbar, und das war der eigentliche Grund, warum jemand die
 * Antwort in eine Datei auslagern und mit einem Skript nachbearbeiten musste.
 *
 * Ein Element einer `SubmodelElementList` traegt keinen `idShort`; dort zaehlt der Index,
 * also `/Markings/0`.
 */
export function schneideZu(geruest: JsonObject, pfad: string): JsonObject | null {
  const teile = pfad.split("/").filter((teil) => teil !== "");
  let aktuell: JsonObject = geruest;

  for (const teil of teile) {
    const kinder = KINDLISTEN.map((liste) => aktuell[liste])
      .filter(istKindliste)
      .flat();
    const index = /^[0-9]+$/.test(teil) ? Number(teil) : -1;
    const treffer =
      index >= 0 ? kinder[index] : kinder.find((kind) => kind["idShort"] === teil);
    if (treffer === undefined) return null;
    aktuell = treffer;
  }

  return aktuell;
}

/** Die idShorts direkt unter einem Element, fuer die Fehlermeldung eines falschen Pfades. */
export function kinderNamen(geruest: JsonObject): string[] {
  return KINDLISTEN.map((liste) => geruest[liste])
    .filter(istKindliste)
    .flat()
    .map((kind, i) => (typeof kind["idShort"] === "string" ? kind["idShort"] : String(i)));
}
