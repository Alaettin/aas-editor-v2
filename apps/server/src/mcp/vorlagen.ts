import type { JsonObject, JsonValue } from "@aas-editor/core";
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
];

export const KENNUNGEN: readonly string[] = KATALOG.map((v) => v.kennung);

export function vorlageVon(kennung: string): VorlagenEintrag | undefined {
  return KATALOG.find((v) => v.kennung === kennung);
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
  const submodels = eintrag.quelle["submodels"];
  const erstes = Array.isArray(submodels) ? submodels[0] : undefined;
  if (!istObjekt(erstes)) {
    // Kein Bedienfehler, sondern eine kaputte Vorlagendatei.
    throw new Error(`Die Vorlage ${eintrag.kennung} enthaelt kein Submodel.`);
  }

  const zaehler: Zaehler = { weggelassen: 0, ohneKardinalitaet: 0 };
  const submodel = eindampfen(erstes, zaehler);
  submodel["id"] = erstes["id"] ?? "";
  submodel["kind"] = "Instance";

  return {
    submodel,
    weggelassen: zaehler.weggelassen,
    ohneKardinalitaet: zaehler.ohneKardinalitaet,
  };
}

/** Die `semanticId` des Teilmodells als schlichte Zeichenkette, fuer die Uebersicht. */
export function semantikVon(eintrag: VorlagenEintrag): string {
  const submodels = eintrag.quelle["submodels"];
  const erstes = Array.isArray(submodels) ? submodels[0] : undefined;
  if (!istObjekt(erstes)) return "";
  const semantik = erstes["semanticId"];
  if (!istObjekt(semantik)) return "";
  const keys = semantik["keys"];
  if (!Array.isArray(keys)) return "";
  return keys
    .filter(istObjekt)
    .map((k) => String(k["value"] ?? ""))
    .join(", ");
}
