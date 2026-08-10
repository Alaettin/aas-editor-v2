import type { JsonObject, JsonValue } from "@aas-editor/core";
import {
  istKindliste,
  istObjekt,
  kinderDerVorlage,
  KINDLISTEN,
  PLATZHALTER,
  pflichtGeruest,
  submodelVon,
  WEG,
  type VorlagenEintrag,
} from "./vorlagen.js";

/**
 * Aus einer IDTA-Vorlage und ein paar Werten ein einsetzbares Teilmodell.
 *
 * Der Anlass steht im Feldbericht vom 10.08.2026. Fuer eine AAS mit drei Teilmodellen
 * mussten rund fuenfhundert Zeilen JSON geschickt werden, und **vier Fuenftel davon waren
 * Metamodell-Geruest**: achtzigmal
 * `{"type":"ExternalReference","keys":[{"type":"GlobalReference","value":"..."}]}`. Der
 * inhaltliche Anteil, also das, was wirklich im Datenblatt steht, war der Rest.
 *
 * Der Server kennt semanticId, IRDI, valueType und Listenstruktur bereits: sie stehen in
 * den Dateien des Herausgebers unter `apps/server/vorlagen/`. Es gibt keinen Grund, dass
 * ein Sprachmodell sie abtippt, und genau beim Abtippen entstehen die Fehler, vor denen
 * die Werkzeugbeschreibung warnt.
 *
 * Also andersherum: der Aufrufer schickt nur `{"/GeneralInformation/ManufacturerName":
 * "Endress+Hauser"}`, und alles andere holt sich der Server aus der Vorlage.
 *
 * **Gebaut wird auf dem Pflicht-Geruest**, nicht auf der leeren Wiese. Damit ist ohne
 * weiteres Zutun alles da, was das Metamodell verlangt; die Werte ueberschreiben es, und
 * was uebrig bleibt, steht als `TODO` da und wird als `offen` gemeldet. Ein Geruest, das
 * durchlaeuft und sichtbar auszufuellen ist, ist mehr wert als eines, das leer ist und
 * scheitert.
 */

export interface Offen {
  readonly pfad: string;
  readonly modelType: string;
}

export interface Instanz {
  readonly submodel: JsonObject;
  /** Die Pfade, an denen ein Wert gesetzt wurde. */
  readonly gesetzt: readonly string[];
  /** Pflichtelemente, die noch auf ihrem Platzhalter stehen. */
  readonly offen: readonly Offen[];
}

/** Ein Pfad liess sich nicht aufloesen. Traegt, was es an der Bruchstelle gibt. */
export interface PfadFehler {
  readonly pfad: string;
  readonly grund: string;
  readonly hinweis: string;
}

export function istPfadFehler(wert: unknown): wert is PfadFehler {
  return typeof wert === "object" && wert !== null && "grund" in wert && "hinweis" in wert;
}

// --- Pfade -----------------------------------------------------------------------------

/**
 * Ein idShort-Pfad in seine Teile.
 *
 * Dieselbe Schreibweise wie bei `aas_vorlage(pfad=...)`, damit niemand zwei lernen muss:
 * `/GeneralInformation/ManufacturerName`, und in einer Liste zaehlt der Index,
 * `/Markings/0/MarkingName`.
 */
function teileVon(pfad: string): string[] {
  return pfad.split("/").filter((teil) => teil !== "");
}

/**
 * Die Kindliste eines **Instanz**elements, samt ihrem Namen.
 *
 * Fuer die Vorlage gilt `kinderDerVorlage`: dort kommen die eingehaengten Adressfelder
 * hinzu, die im Nameplate selbst fehlen. Hier nicht, denn was in der Instanz steht, steht
 * wirklich da.
 */
function kindliste(element: JsonObject): { name: string; kinder: JsonObject[] } | null {
  for (const name of KINDLISTEN) {
    const kinder = element[name];
    if (istKindliste(kinder)) return { name, kinder };
  }
  return null;
}

/**
 * Was es an dieser Stelle gibt.
 *
 * Bis zum 10.08.2026 nannte die Fehlermeldung eines falschen Pfades die Kinder der
 * **Wurzel**, nicht die der Stelle, an der es hakte. Bei `/GeneralInformation/Gibtsnicht`
 * bekam man also die Namen von ganz oben, und die halfen nicht.
 */
function namenIn(element: JsonObject): string[] {
  const liste = kinderDerVorlage(element);
  if (liste === null) return [];
  return liste.kinder.map((kind, i) =>
    typeof kind["idShort"] === "string" && kind["idShort"] !== ""
      ? kind["idShort"]
      : `${i} (Listenglied ohne idShort)`,
  );
}

// --- Materialisieren -------------------------------------------------------------------

/**
 * Ein Vorlagenelement als Anfang eines Instanzelements: ohne Kinder, ohne Beispielwert.
 *
 * `semanticId`, `valueType`, `contentType` und `typeValueListElement` bleiben unveraendert
 * stehen. **Das ist der ganze Punkt**: sie kommen aus der Datei des Herausgebers und gehen
 * nie ueber die Leitung.
 */
function huelleVon(vorlage: JsonObject): JsonObject {
  const out: JsonObject = {};
  for (const [feld, wert] of Object.entries(vorlage)) {
    if (WEG.has(feld)) continue;
    if ((KINDLISTEN as readonly string[]).includes(feld)) continue;
    /*
     * Ein leerer idShort ist schlimmer als keiner. Die IDTA schreibt ihn an den Gliedern
     * ihrer SubmodelElementLists so hin (`"idShort": ""` am Markings-Exemplar des
     * Nameplates), das Metamodell verlangt dort aber gar keinen und verbietet einen
     * leeren gleich dreifach: "must not be empty", das Namensmuster und die Eindeutigkeit
     * unter Geschwistern. Aufgefallen an zwei Markings, die sechs Verstoesse ergaben.
     */
    if (feld === "idShort" && String(wert).trim() === "") continue;
    out[feld] = wert;
  }
  const liste = kinderDerVorlage(vorlage);
  if (liste !== null) out[liste.name] = [];
  return out;
}

/**
 * Das Kind der Vorlage zu einem Pfadteil.
 *
 * Ein Index jenseits des Vorhandenen faellt auf das **erste** Glied zurueck: eine
 * SubmodelElementList fuehrt in der Vorlage genau ein Exemplar, und aus dem entstehen
 * beliebig viele. So werden aus einem `Markings`-Glied drei Kennzeichnungen, ohne dass die
 * Vorlage sie kennt.
 */
function vorlagenKind(vorlage: JsonObject, teil: string): JsonObject | null {
  const liste = kinderDerVorlage(vorlage);
  if (liste === null) return null;

  if (/^[0-9]+$/.test(teil)) {
    const index = Number(teil);
    return liste.kinder[index] ?? liste.kinder[0] ?? null;
  }
  return liste.kinder.find((kind) => kind["idShort"] === teil) ?? null;
}

/**
 * Das passende Kind in der Instanz, notfalls neu angelegt.
 *
 * Bei einem Index werden fehlende Glieder bis dorthin aus dem Vorlagenexemplar
 * aufgefuellt. Ein Loch in einer Liste waere sonst `null`, und das schreibt kein
 * Formatschreiber sinnvoll heraus.
 */
function instanzKind(
  instanz: JsonObject,
  vorlageKind: JsonObject,
  teil: string,
  listenName: string,
): JsonObject {
  const vorhanden = instanz[listenName];
  const kinder = istKindliste(vorhanden) ? vorhanden : [];
  instanz[listenName] = kinder;

  if (/^[0-9]+$/.test(teil)) {
    const index = Number(teil);
    while (kinder.length <= index) kinder.push(huelleVon(vorlageKind));
    return kinder[index]!;
  }

  const treffer = kinder.find((kind) => kind["idShort"] === teil);
  if (treffer !== undefined) return treffer;

  const neu = huelleVon(vorlageKind);
  kinder.push(neu);
  return neu;
}

// --- Werte setzen ----------------------------------------------------------------------

const ZAHL_TYPEN = new Set([
  "xs:integer",
  "xs:int",
  "xs:long",
  "xs:short",
  "xs:byte",
  "xs:decimal",
  "xs:double",
  "xs:float",
  "xs:unsignedInt",
  "xs:unsignedLong",
  "xs:nonNegativeInteger",
  "xs:positiveInteger",
]);

/**
 * Einen Wert in der Schreibweise ablegen, die das Metamodell an dieser Stelle verlangt.
 *
 * Der Aufrufer schreibt, was im Datenblatt steht; die Uebersetzung in `[{language, text}]`
 * oder in eine `ExternalReference` ist Buchhaltung und gehoert hierher. Passt der Wert
 * nicht zum `valueType` der Vorlage, ist das ein Fehler mit dem erwarteten Typ im Text und
 * kein stilles Durchreichen: ein `xs:date`, in dem "Sommer 2024" steht, faellt sonst erst
 * beim Pruefen auf, und dann ohne Bezug zur Eingabe.
 */
function setzeWert(ziel: JsonObject, wert: JsonValue, pfad: string): PfadFehler | null {
  const art = String(ziel["modelType"] ?? "");

  switch (art) {
    case "MultiLanguageProperty": {
      ziel["value"] = alsSprachtexte(wert);
      return null;
    }
    case "Range": {
      if (!istObjekt(wert)) {
        return {
          pfad,
          grund: `${pfad} ist ein Range und braucht min und max.`,
          hinweis: 'Etwa {"min": "-40", "max": "80"}.',
        };
      }
      if (wert["min"] !== undefined) ziel["min"] = String(wert["min"]);
      if (wert["max"] !== undefined) ziel["max"] = String(wert["max"]);
      return null;
    }
    case "ReferenceElement": {
      ziel["value"] = istObjekt(wert) ? wert : externerVerweis(String(wert));
      return null;
    }
    case "File":
    case "Blob": {
      if (istObjekt(wert)) {
        if (wert["value"] !== undefined) ziel["value"] = String(wert["value"]);
        if (wert["contentType"] !== undefined) ziel["contentType"] = String(wert["contentType"]);
        return null;
      }
      // Blosser Pfad: der contentType steht schon aus der Vorlage da.
      ziel["value"] = String(wert);
      return null;
    }
    case "Property": {
      const typ = String(ziel["valueType"] ?? "xs:string");
      const text = typeof wert === "string" ? wert : JSON.stringify(wert);
      const beanstandung = pruefeValueType(text, typ, pfad);
      if (beanstandung !== null) return beanstandung;
      ziel["value"] = text;
      return null;
    }
    default: {
      // SubmodelElementCollection, SubmodelElementList und alles Weitere: ein Wert an
      // einem Behaelter ist keine Zuweisung, sondern ein Missverstaendnis ueber den Pfad.
      return {
        pfad,
        grund: `${pfad} ist ein ${art} und nimmt keinen Wert entgegen.`,
        hinweis: `Ein Kind darunter ansprechen. Vorhanden: ${namenIn(ziel).join(", ") || "keines"}.`,
      };
    }
  }
}

function pruefeValueType(text: string, typ: string, pfad: string): PfadFehler | null {
  if (ZAHL_TYPEN.has(typ) && !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text.trim())) {
    return {
      pfad,
      grund: `${pfad} ist ${typ}, "${text}" ist keine Zahl.`,
      hinweis: "Den Zahlenwert ohne Einheit angeben; die Einheit steht in der semanticId.",
    };
  }
  if (typ === "xs:boolean" && !["true", "false", "1", "0"].includes(text.trim())) {
    return { pfad, grund: `${pfad} ist xs:boolean, "${text}" passt nicht.`, hinweis: "true oder false." };
  }
  if (typ === "xs:date" && !/^-?\d{4}-\d{2}-\d{2}(Z|[+-]\d{2}:\d{2})?$/.test(text.trim())) {
    return {
      pfad,
      grund: `${pfad} ist xs:date, "${text}" passt nicht.`,
      hinweis: "Schreibweise JJJJ-MM-TT, etwa 2024-03-17.",
    };
  }
  if (
    typ === "xs:dateTime" &&
    !/^-?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(text.trim())
  ) {
    return {
      pfad,
      grund: `${pfad} ist xs:dateTime, "${text}" passt nicht.`,
      hinweis: "Schreibweise JJJJ-MM-TTThh:mm:ss, etwa 2024-03-17T08:30:00Z.",
    };
  }
  return null;
}

/** `{"de": "..."}` oder eine blosse Zeichenkette zu `[{language, text}]`. */
function alsSprachtexte(wert: JsonValue): JsonValue {
  if (typeof wert === "string") return [{ language: "de", text: wert }];
  if (Array.isArray(wert)) return wert;
  if (istObjekt(wert)) {
    return Object.entries(wert).map(([language, text]) => ({ language, text: String(text) }));
  }
  return [{ language: "de", text: String(wert) }];
}

function externerVerweis(wert: string): JsonValue {
  return { type: "ExternalReference", keys: [{ type: "GlobalReference", value: wert }] };
}

// --- offene Pflichtfelder --------------------------------------------------------------

/**
 * Was noch auf seinem Platzhalter steht.
 *
 * Der Aufrufer bekommt das als Liste zurueck, statt es sich aus einer Befundliste
 * zusammenzureimen. Ein `TODO` ist kein Verstoss, es besteht die Pruefung; genau deshalb
 * faellt es sonst nirgends auf.
 */
function sammleOffene(element: JsonObject, pfad: string, hinein: Offen[]): void {
  const art = String(element["modelType"] ?? "");
  const wert = element["value"];

  if (art === "MultiLanguageProperty" && Array.isArray(wert)) {
    if (wert.some((e) => istObjekt(e) && e["text"] === PLATZHALTER)) {
      hinein.push({ pfad, modelType: art });
    }
  } else if (typeof wert === "string" && (wert === "" || wert === PLATZHALTER)) {
    hinein.push({ pfad, modelType: art });
  }

  const liste = kindliste(element);
  if (liste === null) return;
  for (const [i, kind] of liste.kinder.entries()) {
    const name =
      typeof kind["idShort"] === "string" && kind["idShort"] !== "" ? kind["idShort"] : String(i);
    sammleOffene(kind, `${pfad}/${name}`, hinein);
  }
}

// --- der Einstieg ----------------------------------------------------------------------

export interface InstanzKopf {
  readonly id?: string | null;
  readonly idShort?: string | null;
}

/**
 * Ein Teilmodell aus Vorlage und Werten.
 *
 * `werte` bildet idShort-Pfade auf Werte ab. Ein Pfad, der sich in der Vorlage nicht
 * findet, ist ein Fehler und **kein** stilles Ueberspringen: ein weggeworfener Wert waere
 * genau die Art Fehler, die erst am fertigen AASX auffaellt.
 */
export function instanzErzeugen(
  eintrag: VorlagenEintrag,
  werte: Readonly<Record<string, JsonValue>>,
  kopf: InstanzKopf = {},
): Instanz | PfadFehler {
  const vorlage = submodelVon(eintrag);
  const geruest = pflichtGeruest(eintrag);
  const submodel = structuredClone(geruest.submodel);

  const gesetzt: string[] = [];

  for (const [rohPfad, wert] of Object.entries(werte)) {
    const teile = teileVon(rohPfad);
    if (teile.length === 0) {
      return {
        pfad: rohPfad,
        grund: "Ein leerer Pfad zeigt auf das Teilmodell selbst.",
        hinweis: `Ein Kind ansprechen, etwa /${namenIn(vorlage)[0] ?? "..."}.`,
      };
    }

    let vorlagenStand = vorlage;
    let instanzStand = submodel;
    let gegangen = "";

    for (const teil of teile) {
      const liste = kinderDerVorlage(vorlagenStand);
      const kind = vorlagenKind(vorlagenStand, teil);
      if (kind === null || liste === null) {
        return {
          pfad: rohPfad,
          grund: `"${teil}" gibt es in der Vorlage ${eintrag.kennung} nicht unter "${gegangen || "/"}".`,
          hinweis:
            namenIn(vorlagenStand).length === 0
              ? `Unter "${gegangen || "/"}" fuehrt die Vorlage keine Kinder.`
              : `Dort gibt es: ${namenIn(vorlagenStand).join(", ")}.`,
        };
      }
      instanzStand = instanzKind(instanzStand, kind, teil, liste.name);
      vorlagenStand = kind;
      gegangen = `${gegangen}/${teil}`;
    }

    const beanstandung = setzeWert(instanzStand, wert, `/${teile.join("/")}`);
    if (beanstandung !== null) return beanstandung;
    gesetzt.push(`/${teile.join("/")}`);
  }

  // Kopfdaten zuletzt: eine eigene id ist der Unterschied zwischen einer Instanz und einer
  // Abschrift der Vorlage, und die Werkzeugbeschreibung sagt das auch.
  if (typeof kopf.idShort === "string" && kopf.idShort.trim() !== "") {
    submodel["idShort"] = kopf.idShort.trim();
  }
  submodel["id"] =
    typeof kopf.id === "string" && kopf.id.trim() !== ""
      ? kopf.id.trim()
      : eigeneId(String(submodel["idShort"] ?? eintrag.kennung));
  submodel["kind"] = "Instance";

  const offen: Offen[] = [];
  const liste = kindliste(submodel);
  for (const [i, kind] of (liste?.kinder ?? []).entries()) {
    const name =
      typeof kind["idShort"] === "string" && kind["idShort"] !== "" ? kind["idShort"] : String(i);
    sammleOffene(kind, `/${name}`, offen);
  }

  return { submodel, gesetzt, offen };
}

/**
 * Eine id, die nicht die der Vorlage ist.
 *
 * Ohne Zeitstempel und ohne Zufall: beides waere in einem Test nicht wiederholbar, und die
 * id soll aus demselben Aufruf dieselbe sein. Wer eine sprechende will, gibt sie mit.
 */
function eigeneId(idShort: string): string {
  const sauber = idShort.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase();
  return `urn:aas-editor:submodel:${sauber}`;
}

// --- die Schale ------------------------------------------------------------------------

export interface SchalenKopf {
  readonly globalAssetId: string;
  readonly assetKind?: string | null;
  readonly idShort?: string | null;
  readonly id?: string | null;
}

/**
 * Eine AssetAdministrationShell samt Verweisen auf ihre Teilmodelle.
 *
 * Der vergessene Verweis war in der echten Sitzung eine eigene Korrekturrunde: das
 * Teilmodell stand im Environment, die Schale kannte es nicht, und aufgefallen ist es erst
 * beim Lesen der fertigen Datei. Wer die Schale baut, baut die Verweise mit.
 */
export function schaleBauen(kopf: SchalenKopf, submodels: readonly JsonObject[]): JsonObject {
  const idShort = kopf.idShort?.trim() ?? "";
  return {
    modelType: "AssetAdministrationShell",
    id:
      kopf.id?.trim() !== undefined && kopf.id?.trim() !== ""
        ? kopf.id.trim()
        : `urn:aas-editor:shell:${(idShort || "aas").replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}`,
    ...(idShort === "" ? {} : { idShort }),
    assetInformation: {
      assetKind: kopf.assetKind?.trim() !== undefined && kopf.assetKind.trim() !== ""
        ? kopf.assetKind.trim()
        : "Instance",
      globalAssetId: kopf.globalAssetId.trim(),
    },
    submodels: submodels.map((sm) => verweisAuf(String(sm["id"] ?? ""))),
  };
}

/** Ein ModelReference auf ein Teilmodell. */
export function verweisAuf(id: string): JsonObject {
  return { type: "ModelReference", keys: [{ type: "Submodel", value: id }] };
}
