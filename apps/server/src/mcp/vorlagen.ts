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
 * Werkzeugbeschreibung warnt.
 *
 * Bis zum 10.08.2026 stand hier nur ein Verweis auf einen **zweiten** Aufruf. Das war die
 * halbe Auskunft: der Aufrufer musste sich aus der anderen Vorlage selbst zusammensuchen,
 * was hierher gehoert, und genau dabei entsteht wieder Raten. Die Felder werden jetzt
 * eingehaengt, siehe `adressfelderFuer`. Der Hinweis bleibt und sagt, woher sie kommen.
 */
const ADRESS_SEMANTIK =
  "https://admin-shell.io/zvei/nameplate/1/0/ContactInformations/AddressInformation";

const ADRESS_QUELLE =
  "Diese Kinder stehen nicht im Nameplate. Sie stammen aus IDTA 02002 ContactInformation, " +
  "dort flach unter /ContactInformation, und sind hier eingehaengt. Das SMT-Drop-in " +
  "\"Address Information\", auf das Nameplate 3.0 verweist, liegt beim Herausgeber nicht " +
  "als JSON vor. Belegte, aber andere Quelle: vor dem Ausliefern pruefen, ob die " +
  "semanticId so gewollt ist.";

const FUNDSTELLEN: Readonly<Record<string, string>> = {
  [ADRESS_SEMANTIK]:
    "Nameplate 3.0 fuehrt AddressInformation als Pflicht, laesst es leer und verweist auf " +
    "ein SMT-Drop-in, das beim Herausgeber nicht als JSON vorliegt. Die Kinder unten sind " +
    "deshalb eingehaengt, siehe _quelle. Nicht raten.",
};

/**
 * Die Adressfelder aus IDTA 02002, sofern das Element nach ihnen verlangt.
 *
 * Gesucht wird `ContactInformation` in `contactinformation-1-0-1`; seine Kinder sind genau
 * die Felder samt IRDI. Findet sich das Element nicht, wird nichts eingehaengt: eine
 * geratene Struktur waere schlimmer als eine leere.
 */
function adressfelderFuer(semantik: string): JsonObject[] | null {
  if (semantik !== ADRESS_SEMANTIK) return null;
  return adressfelder();
}

let adressfelderZwischenspeicher: JsonObject[] | null | undefined;

function adressfelder(): JsonObject[] | null {
  if (adressfelderZwischenspeicher !== undefined) return adressfelderZwischenspeicher;

  const eintrag = KATALOG.find((v) => v.kennung === "contactinformation-1-0-1");
  const gefunden =
    eintrag === undefined ? null : sucheNachIdShort(submodelVon(eintrag), "ContactInformation");
  const kinder = gefunden === null ? null : kindlisteVon(gefunden);

  adressfelderZwischenspeicher = kinder !== null && kinder.length > 0 ? kinder : null;
  return adressfelderZwischenspeicher;
}

/** Das erste Element mit diesem `idShort` im Teilbaum, in der Tiefe zuerst. */
function sucheNachIdShort(element: JsonObject, idShort: string): JsonObject | null {
  if (element["idShort"] === idShort) return element;
  for (const liste of KINDLISTEN) {
    const kinder = element[liste];
    if (!istKindliste(kinder)) continue;
    for (const kind of kinder) {
      const treffer = sucheNachIdShort(kind, idShort);
      if (treffer !== null) return treffer;
    }
  }
  return null;
}

/** Die erste belegte Kindliste eines Elements. */
function kindlisteVon(element: JsonObject): JsonObject[] | null {
  for (const liste of KINDLISTEN) {
    const kinder = element[liste];
    if (istKindliste(kinder)) return kinder;
  }
  return null;
}

/**
 * Die Kinder eines Vorlagenelements, samt dem Namen ihrer Liste.
 *
 * Die **eine** Stelle, an der die eingehaengten Adressfelder sichtbar werden. Wer die
 * Vorlage entlanglaeuft, soll sie sehen, ohne davon zu wissen: sonst kennt `aas_vorlage`
 * die Felder und `teilmodell_erzeugen` nicht, und ein Pfad, den die Ausgabe des einen
 * Werkzeugs anbietet, wird vom anderen abgelehnt.
 */
export function kinderDerVorlage(
  element: JsonObject,
): { name: string; kinder: JsonObject[] } | null {
  const eingehaengt = adressfelderFuer(semantikStringVon(element));
  if (eingehaengt !== null) return { name: "value", kinder: eingehaengt };

  for (const name of KINDLISTEN) {
    const kinder = element[name];
    if (istKindliste(kinder)) return { name, kinder };
  }
  return null;
}

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
 *
 * Zwei Namen, und das ist keine Bequemlichkeit. Nameplate, TechnicalData und
 * HandoverDocumentation schreiben `SMT/Cardinality`; IDTA 02002 ContactInformation
 * schreibt `Multiplicity`, sechsunddreissig Mal, mit denselben Werten. Wer nur den ersten
 * Namen kennt, haelt die Datei fuer eine ohne Kardinalitaeten und lehnt `umfang=pflicht`
 * dort ab. Genau so stand es bis zum 10.08.2026 im Code, und genau so wurde es dann auch
 * berichtet: als Vorlage, die keine Qualifier fuehrt. Sie fuehrt welche.
 */
const KARDINALITAET = new Set(["SMT/Cardinality", "Multiplicity"]);
export const PFLICHT = new Set(["One", "OneToMany"]);

/** Kindlisten, in denen weitere SubmodelElements haengen koennen. */
export const KINDLISTEN = ["submodelElements", "value", "statements", "annotations"] as const;

export function istObjekt(wert: JsonValue | undefined): wert is JsonObject {
  return typeof wert === "object" && wert !== null && !Array.isArray(wert);
}

/** Die `semanticId` eines Elements als schlichte Zeichenkette, leer wenn es keine gibt. */
export function semantikStringVon(element: JsonObject): string {
  const semantik = element["semanticId"];
  if (!istObjekt(semantik)) return "";
  const keys = semantik["keys"];
  if (!Array.isArray(keys)) return "";
  return keys
    .filter(istObjekt)
    .map((k) => String(k["value"] ?? ""))
    .join(", ");
}

export function kardinalitaetVon(element: JsonObject): string | null {
  const quals = element["qualifiers"];
  if (!Array.isArray(quals)) return null;
  for (const q of quals) {
    if (istObjekt(q) && KARDINALITAET.has(String(q["type"])) && typeof q["value"] === "string") {
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
export const WEG = new Set([
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
export function istKindliste(wert: JsonValue | undefined): wert is JsonObject[] {
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
    // Ein leerer idShort ist schlimmer als keiner: das Metamodell verlangt an einem Glied
    // einer SubmodelElementList gar keinen und verbietet einen leeren. Siehe `instanz.ts`.
    if (feld === "idShort" && String(wert).trim() === "") continue;
    out[feld] = wert;
  }

  const kard = kardinalitaetVon(element);
  if (kard !== null) out["_kardinalitaet"] = kard;
  const semantik = semantikStringVon(element);
  const fundstelle = FUNDSTELLEN[semantik];
  if (fundstelle !== undefined) out["_hinweis"] = fundstelle;

  /*
   * Die Adressfelder werden eingehaengt statt auf einen zweiten Aufruf verwiesen. Sie
   * durchlaufen dasselbe Eindampfen wie alles andere, also gilt auch hier: nur Pflicht.
   *
   * In IDTA 02002 ist allerdings **jedes** der 23 Felder optional. Uebrig bleibt deshalb
   * eine leere Liste, und die ist laut Metamodell ein Verstoss ("Value must be either not
   * set or have at least one item"). Also gar kein `value`, und stattdessen die Auskunft,
   * wo die Felder zu sehen sind.
   */
  const eingehaengt = adressfelderFuer(semantik);
  if (eingehaengt !== null) {
    const pflicht = eingehaengt.filter((kind) => PFLICHT.has(kardinalitaetVon(kind) ?? ""));
    if (pflicht.length > 0) {
      out["value"] = pflicht.map((kind) => eindampfen(kind, zaehler));
      out["_quelle"] = ADRESS_QUELLE;
    } else {
      zaehler.weggelassen += eingehaengt.length;
      out["_hinweis"] =
        `${fundstelle ?? ""} In IDTA 02002 ist jedes der ${eingehaengt.length} Adressfelder ` +
        "optional, deshalb steht hier nichts. umfang=struktur zeigt sie alle mit ihren IRDIs.";
    }
    return out;
  }

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
export const PLATZHALTER = "TODO";

export function leererWert(element: JsonObject): JsonValue {
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
export function submodelVon(eintrag: VorlagenEintrag): JsonObject {
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

/**
 * Elemente, die nur sagen "hier darf beliebiges stehen".
 *
 * Die IDTA rollt sie in ihren Dateien voll aus, und zwar verschachtelt: in
 * `technicaldata-2-0` tragen `Section` und `ArbitrarySMC` jeweils denselben Sechserblock,
 * und der ganze Bau steht ein zweites Mal unter `SpecificDescriptions`. Jeder dieser Namen
 * kommt dadurch sechsmal in der Datei vor.
 *
 * Wiedergegeben ergibt das rund dreissig Zeilen JSON, deren gesamte Aussage in einen Satz
 * passt. Ausgerollt wird das nicht mehr; wer die Namen wirklich braucht, nimmt
 * `umfang=vollstaendig` mit `pfad`.
 */
const PLATZHALTER_NAMEN = new Set([
  "Section",
  "ArbitrarySMC",
  "ArbitrarySML",
  "ArbitraryProperty",
  "ArbitraryMLP",
  "ArbitraryRange",
  "ArbitraryFile",
  "ArbitraryBlob",
  "ArbitraryEntity",
  "ArbitraryRelationshipElement",
  "arbitrary",
]);

const BELIEBIG_HINWEIS =
  "Hier darf beliebiger Inhalt stehen: die Vorlage fuehrt an dieser Stelle nur Platzhalter " +
  "(Section, ArbitrarySMC, ArbitrarySML, ArbitraryProperty, ArbitraryMLP, ArbitraryRange). " +
  "Sie sind nicht auszufuellen und stehen so nicht in einer Instanz. Wer sie im Wortlaut " +
  "braucht: umfang=vollstaendig mit pfad.";

function istPlatzhalter(element: JsonObject): boolean {
  return PLATZHALTER_NAMEN.has(String(element["idShort"] ?? ""));
}

function strukturieren(element: JsonObject, mitKardinalitaet: boolean): JsonObject {
  const out: JsonObject = {};
  for (const feld of STRUKTURFELDER) {
    if (element[feld] !== undefined) out[feld] = element[feld];
  }

  // Die semanticId als blosse Zeichenkette: das Objekt drumherum kostet das Vierfache und
  // sagt nichts, was hier gebraucht wird. Wer sie einsetzbar will, nimmt pflicht.
  const semantik = semantikStringVon(element);
  if (semantik !== "") out["semanticId"] = semantik;

  const kard = kardinalitaetVon(element);
  // "ohne Angabe" an jedem einzelnen Element ist Rauschen, sobald die Vorlage gar keine
  // Kardinalitaeten fuehrt. Dann steht es einmal oben.
  if (kard !== null) out["_kardinalitaet"] = kard;
  else if (mitKardinalitaet) out["_kardinalitaet"] = "ohne Angabe";

  const fundstelle = FUNDSTELLEN[semantik];
  if (fundstelle !== undefined) out["_hinweis"] = fundstelle;

  const eingehaengt = adressfelderFuer(semantik);
  if (eingehaengt !== null) {
    out["value"] = eingehaengt.map((kind) => strukturieren(kind, mitKardinalitaet));
    out["_quelle"] = ADRESS_QUELLE;
    return out;
  }

  for (const liste of KINDLISTEN) {
    const kinder = element[liste];
    if (!istKindliste(kinder)) continue;
    const echte = kinder.filter((kind) => !istPlatzhalter(kind));
    if (echte.length !== kinder.length) out["_beliebig"] = BELIEBIG_HINWEIS;
    if (echte.length > 0) out[liste] = echte.map((kind) => strukturieren(kind, mitKardinalitaet));
  }

  return out;
}

export function strukturGeruest(eintrag: VorlagenEintrag): JsonObject {
  const erstes = submodelVon(eintrag);
  const mitKardinalitaet = irgendwoKardinalitaet(erstes);
  const out = strukturieren(erstes, mitKardinalitaet);
  if (!mitKardinalitaet) {
    out["_kardinalitaet"] =
      "Diese Vorlage fuehrt gar keine Kardinalitaets-Qualifier. Was Pflicht ist, steht " +
      "nicht in der Datei und laesst sich daraus nicht ableiten.";
  }
  return out;
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
