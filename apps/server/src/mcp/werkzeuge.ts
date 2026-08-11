import {
  buildPathIndex,
  childSlotsOf,
  denormalize,
  ENUMS,
  fieldsOf,
  IDENTIFIABLE_KINDS,
  istKernFehler,
  newNodeData,
  normalize,
  specOf,
  SUBMODEL_ELEMENT_KINDS,
  walk,
  type ElementSpec,
  type EnumName,
  type JsonObject,
  type JsonValue,
} from "@aas-editor/core";
import {
  exportFile,
  importFile,
  normalizePath,
  type AasFormat,
  type Attachment,
} from "@aas-editor/core/io";
import { validate, type ValidationIssue } from "@aas-editor/core/validation";
import type { ServerEnv } from "../env.js";
import {
  anhaenge as anhangsAblage,
  ausgabe,
  entwuerfe,
  type Ablage,
} from "../services/ablage.js";
import {
  ausBase64,
  istBytesFehler,
  pruefeSignatur,
  pruefeZusage,
  sha256Von,
} from "./bytes.js";
import {
  instanzErzeugen,
  istPfadFehler,
  schaleBauen,
  verweisAuf,
  type Instanz,
  type SchalenKopf,
} from "./instanz.js";
import { holeSicher, NetzFehler } from "./netz.js";
import { lies as zeigerLesen, wendeAn, ZeigerFehler, type Patch } from "./zeiger.js";
import {
  KATALOG,
  KENNUNGEN,
  kinderNamen,
  maengelVon,
  pflichtGeruest,
  schneideZu,
  semantikVon,
  strukturGeruest,
  vorlageVon,
  type VorlagenEintrag,
} from "./vorlagen.js";

/**
 * Die Werkzeuge des MCP-Servers.
 *
 * Bewusst ohne Fastify- und ohne MCP-Typen: hier stehen reine Funktionen ueber
 * `@aas-editor/core`, `mcp/server.ts` haengt nur die Schemata davor. Das war die Naht, an
 * der eine spaetere Absicherung einen Benutzer durchreichen kann, ohne dass ein Werkzeug
 * davon wissen muss, und genau so ist es am 11.08.2026 gekommen: `Umgebung.benutzer` ist
 * das einzige, was dazugekommen ist, und kein Werkzeug prueft ihn selbst. Er wandert nur
 * weiter an die Ablage, die damit ihre Eintraege auseinanderhaelt.
 *
 * **Zustandslos.** Kein Werkzeug sieht die Datenbank, keines kennt ein Projekt. Der
 * Zwischenstand einer entstehenden AAS lebt im Gespraech, nicht auf dem Server; nur
 * Dateien liegen kurz in der Ablage, in beide Richtungen (`services/ablage.ts`).
 */

export interface Umgebung {
  readonly env: ServerEnv;
  /** Wurzel fuer Download-Links, aus der Anfrage abgeleitet, ohne abschliessenden Schraegstrich. */
  readonly basisUrl: string;
  /**
   * Wer angerufen hat, geprueft in `mcp/zugang.ts`.
   *
   * Die Kennung des Nutzers beim Hub, oder die feste Kennung des Bearer-Tokens. Sie ist
   * hier kein Recht, sondern ein Namensraum: Entwuerfe, Anhaenge und erzeugte Dateien
   * gehoeren dem, der sie angelegt hat, und niemandem sonst.
   */
  readonly benutzer: string;
}

export interface Ergebnis {
  readonly text: string;
  readonly istFehler?: boolean;
}

/** Mehr als das nimmt kein Werkzeug als Text entgegen. */
const MAX_EINGABE = 8 * 1024 * 1024;
/** Mehr Befunde als das liest ohnehin niemand, und die Antwort soll lesbar bleiben. */
const MAX_BEFUNDE = 100;
/** Obergrenze fuer eine einzelne Datei, egal aus welcher Quelle. */
export const MAX_ANHANG_BYTES = 25 * 1024 * 1024;
/** Obergrenze fuer alle Anhaenge eines Containers zusammen. */
const MAX_CONTAINER_BYTES = 100 * 1024 * 1024;
const MAX_ANHAENGE = 25;
/**
 * Enger als der Rest, und das mit Absicht: base64 laeuft durch den Gespraechsspeicher.
 * Fuer mehr ist der Upload-Endpunkt da.
 */
const MAX_BASE64_BYTES = 2 * 1024 * 1024;

/**
 * Positivliste statt Sperrliste. Was hier nicht steht, wird abgelehnt und nicht
 * umgedeutet: ein Container, in dem eine `.exe` als `application/octet-stream` liegt,
 * ist kein AAS-Problem, aber ein Verteilungsweg.
 */
export const ERLAUBTE_TYPEN: readonly string[] = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/tiff",
  "text/plain",
  "text/csv",
  "text/html",
  "application/json",
  "application/xml",
  "text/xml",
  "application/zip",
  // Ein AASX in einem AASX ist ein gueltiger Fall, seit `aas_datei_lesen` seine Anhaenge
  // als Token zurueckgibt. Der Typ ist der aus IDTA-01005-3-2.
  "application/aas+zip",
];

function gib(daten: unknown): Ergebnis {
  return { text: JSON.stringify(daten, null, 2) };
}

/**
 * Ein Fehler wird **zurueckgegeben, nicht geworfen**.
 *
 * Geworfen sieht das Modell nur "internal error" und rennt in dieselbe Wand noch einmal.
 * Als Ergebnis mit `istFehler` liest es den Grund und kann ihn beheben, und genau das
 * ist der Sinn dieser Werkzeuge.
 */
function fehler(grund: string, hinweis?: string): Ergebnis {
  return {
    text: JSON.stringify({ fehler: grund, ...(hinweis === undefined ? {} : { hinweis }) }, null, 2),
    istFehler: true,
  };
}

function istErgebnis(wert: unknown): wert is Ergebnis {
  return typeof wert === "object" && wert !== null && "text" in wert;
}

function istObjekt(wert: JsonValue | undefined): wert is JsonObject {
  return typeof wert === "object" && wert !== null && !Array.isArray(wert);
}

// --- aas_schema -----------------------------------------------------------------------

/** Die Arten, die es ueberhaupt gibt, nach ihrer Rolle sortiert. */
export const ALLE_ARTEN = [
  "Environment",
  ...IDENTIFIABLE_KINDS,
  ...SUBMODEL_ELEMENT_KINDS,
] as readonly string[];

function feldBeschreibung(spec: ElementSpec): unknown[] {
  return fieldsOf(spec)
    .filter((feld) => feld.deprecated !== true)
    .map((feld) => ({
      name: feld.key,
      art: feld.kind,
      pflicht: feld.required === true,
      ...(feld.enum === undefined ? {} : { werte: ENUMS[feld.enum as EnumName] }),
      ...(feld.typedBy === undefined ? {} : { typisiertDurch: feld.typedBy }),
    }));
}

export function aasSchema(eingabe: { art?: string | null }): Ergebnis {
  const art = eingabe.art?.trim() ?? "";

  if (art === "") {
    return gib({
      arten: ALLE_ARTEN.map((name) => ({
        name,
        kindlisten: childSlotsOf(name).map((slot) => slot.name),
      })),
      hinweis:
        "Fuer die Felder einer Art dasselbe Werkzeug noch einmal mit art aufrufen. " +
        "Kindlisten sind die Eigenschaften, unter denen weitere Elemente haengen.",
    });
  }

  const spec = specOf(art);
  if (spec === undefined) {
    return fehler(
      `Unbekannte Art "${art}".`,
      `Erlaubt sind: ${ALLE_ARTEN.join(", ")}. Ohne art liefert das Werkzeug die Uebersicht.`,
    );
  }

  return gib({
    art,
    felder: feldBeschreibung(spec),
    kindlisten: childSlotsOf(art).map((slot) => slot.name),
    // Das Geruest kommt aus derselben Funktion, mit der der Editor ein Element anlegt.
    // Damit ist das Beispiel nie eine Erfindung dieses Moduls, sondern immer gueltig.
    beispiel: art === "Environment" ? undefined : newNodeData(art),
  });
}

// --- aas_vorlage ----------------------------------------------------------------------

export type Vorlagenumfang = "struktur" | "pflicht" | "vollstaendig";

/**
 * Was `_kardinalitaet` mit dem Qualifier zu tun hat.
 *
 * Zweimal dieselbe Angabe, und das ist keine Nachlaessigkeit: `vollstaendig` gibt die Datei
 * des Herausgebers unveraendert heraus, und dort steht sie als `SMT/Cardinality`-Qualifier.
 * Die abgeleiteten Stufen schreiben sie lesbar an das Element. Wer beides nebeneinander
 * sieht, soll wissen, dass es dieselbe Auskunft ist.
 */
const KARDINALITAET_ERKLAERT =
  "_kardinalitaet ist dieselbe Angabe wie der Qualifier SMT/Cardinality in umfang=" +
  "vollstaendig, nur lesbar am Element. Sie ist eine Auskunft und gehoert vor dem Export " +
  "entfernt, ebenso _hinweis.";

export function aasVorlage(eingabe: {
  kennung?: string | null;
  umfang?: Vorlagenumfang | null;
  pfad?: string | null;
  conceptDescriptions?: boolean | null;
}): Ergebnis {
  const kennung = eingabe.kennung?.trim() ?? "";

  if (kennung === "") {
    return gib({
      vorlagen: KATALOG.map((v) => ({
        kennung: v.kennung,
        titel: v.titel,
        idta: v.idta,
        fassung: v.fassung,
        semanticId: semantikVon(v),
      })),
      hinweis:
        "Mit kennung aufrufen, um das Geruest zu bekommen. umfang=struktur (Vorgabe) ist " +
        "der Bauplan, pflicht das einsetzbare Geruest, vollstaendig die ganze Datei. Mit " +
        "pfad laesst sich auf einen Teilbaum eingrenzen, etwa pfad=\"/Markings\". Die " +
        "semanticId-Werte stammen unveraendert aus den offiziellen Vorlagen des " +
        "Herausgebers und duerfen nicht abgewandelt werden.",
    });
  }

  const eintrag = vorlageVon(kennung);
  if (eintrag === undefined) {
    return fehler(`Unbekannte Vorlage "${kennung}".`, `Erlaubt sind: ${KENNUNGEN.join(", ")}.`);
  }

  const umfang: Vorlagenumfang = eingabe.umfang ?? "struktur";
  const pfad = eingabe.pfad?.trim() ?? "";
  const maengel = maengelVon(kennung);
  const kopf = {
    kennung: eintrag.kennung,
    titel: eintrag.titel,
    idta: eintrag.idta,
    umfang,
    ...(pfad === "" ? {} : { pfad }),
    ...(maengel.length === 0 ? {} : { bekannteMaengel: maengel }),
  };

  if (umfang === "vollstaendig") {
    const submodel = zuschneiden(eintrag, pfad);
    if (istErgebnis(submodel)) return submodel;
    /*
     * conceptDescriptions nur auf Verlangen. Sie sind der Loewenanteil der Groesse: bei
     * technicaldata-2-0 machen sie den Unterschied zwischen einer lesbaren Antwort und
     * einer, die den Kontext sprengt.
     */
    const cds = eingabe.conceptDescriptions === true ? eintrag.quelle["conceptDescriptions"] : undefined;
    return gib({
      ...kopf,
      submodel,
      ...(cds === undefined ? {} : { conceptDescriptions: cds }),
      hinweis:
        "Unveraendert aus der Datei des Herausgebers. kind steht auf Template; fuer eine " +
        "echte AAS auf Instance setzen und eine eigene id vergeben. " +
        (eingabe.conceptDescriptions === true
          ? ""
          : "conceptDescriptions=true liefert zusaetzlich die Begriffsdefinitionen."),
    });
  }

  if (umfang === "struktur") {
    const submodel = zuschneiden(eintrag, pfad, strukturGeruest(eintrag));
    if (istErgebnis(submodel)) return submodel;
    return gib({
      ...kopf,
      submodel,
      hinweis:
        "Ein Bauplan, kein einsetzbares JSON: alle Elemente, aber nur idShort, modelType, " +
        "semanticId als Zeichenkette, valueType und Kardinalitaet. Fuer ein Geruest, das " +
        "sich einsetzen laesst, umfang=pflicht nehmen, fuer die ganze Datei vollstaendig. " +
        KARDINALITAET_ERKLAERT,
    });
  }

  const geruest = pflichtGeruest(eintrag);
  /*
   * Fuehrt die Vorlage gar keine Kardinalitaeten, gibt es nichts abzuleiten. Bis zum
   * 10.08.2026 war das ein Fehler mit `isError`, und der kostet eine Runde: das Modell
   * bekommt nichts und muss den naechsten Aufruf raten. Es bekommt jetzt den Bauplan und
   * die Begruendung dazu.
   *
   * Ausgeloest hat das ContactInformation, wo die Diagnose falsch war: die Datei fuehrt
   * sehr wohl Kardinalitaeten, nur unter dem Namen `Multiplicity`, siehe `vorlagen.ts`.
   * Der Zweig bleibt als Netz fuer eine Vorlage, die wirklich keine fuehrt.
   */
  if (!geruest.traegtKardinalitaeten) {
    const bauplan = zuschneiden(eintrag, pfad, strukturGeruest(eintrag));
    if (istErgebnis(bauplan)) return bauplan;
    return gib({
      ...kopf,
      umfang: "struktur",
      submodel: bauplan,
      hinweis:
        `Die Vorlage "${kennung}" fuehrt keine Kardinalitaets-Qualifier (weder ` +
        "SMT/Cardinality noch Multiplicity). Ein Pflicht-Geruest laesst sich daraus nicht " +
        "ableiten, und zwar nicht weil alles optional waere, sondern weil die Datei die " +
        "Angabe nicht kennt. Statt eines leeren Geruests kommt hier der Bauplan; was " +
        "gebraucht wird, ist selbst auszuwaehlen. " +
        KARDINALITAET_ERKLAERT,
    });
  }

  const submodel = zuschneiden(eintrag, pfad, geruest.submodel);
  if (istErgebnis(submodel)) return submodel;

  return gib({
    ...kopf,
    submodel,
    ...(pfad === ""
      ? { weggelassen: geruest.weggelassen, ohneKardinalitaet: geruest.ohneKardinalitaet }
      : {}),
    hinweis:
      "Nur Elemente mit SMT/Cardinality One oder OneToMany, Beispielwerte entfernt. " +
      "Wo TODO steht, verlangt das Metamodell einen nicht leeren Wert; das ist zu " +
      "ersetzen, nicht zu loeschen. " +
      KARDINALITAET_ERKLAERT +
      " Die id ist die der Vorlage und muss durch eine eigene ersetzt werden. " +
      "umfang=struktur zeigt auch die optionalen Elemente.",
  });
}

/** Den Teilbaum herausschneiden, oder sagen, was es an dieser Stelle gibt. */
function zuschneiden(
  eintrag: VorlagenEintrag,
  pfad: string,
  geruest?: JsonObject,
): JsonObject | Ergebnis {
  const wurzel = geruest ?? submodelDerVorlage(eintrag);
  if (pfad === "") return wurzel;

  const treffer = schneideZu(wurzel, pfad);
  if (treffer === null) {
    return fehler(
      `In "${eintrag.kennung}" gibt es den Pfad "${pfad}" nicht.`,
      `Direkt unter der Wurzel stehen: ${kinderNamen(wurzel).join(", ")}.`,
    );
  }
  return treffer;
}

function submodelDerVorlage(eintrag: VorlagenEintrag): JsonObject {
  const submodels = eintrag.quelle["submodels"];
  const erstes = Array.isArray(submodels) ? submodels[0] : undefined;
  if (!istObjekt(erstes)) throw new Error(`Die Vorlage ${eintrag.kennung} enthaelt kein Submodel.`);
  return erstes;
}

// --- Anhaenge -------------------------------------------------------------------------

export interface AnhangsEingabe {
  readonly pfad: string;
  readonly contentType?: string | null;
  readonly url?: string | null;
  readonly base64?: string | null;
  readonly token?: string | null;
  /** Zugesagte Byteszahl. Weicht sie ab, wird abgelehnt. */
  readonly groesse?: number | null;
  /** Zugesagte Pruefsumme, 64 Stellen hex. Weicht sie ab, wird abgelehnt. */
  readonly sha256?: string | null;
}

/**
 * Ein Paketpfad, bevor er in den ZIP-Schreiber geht.
 *
 * Ein Verzeichniswechsel im Pfad ist hier kein theoretisches Problem: der Schreiber baut
 * daraus einen Part-Namen, und ein Leser packt ihn spaeter irgendwo aus.
 */
function pruefePaketpfad(roh: string): string | Ergebnis {
  const pfad = normalizePath(roh.trim());
  if (pfad === "/") return fehler("Ein Anhang braucht einen Pfad.");
  if (pfad.includes("\\")) {
    return fehler(`Der Pfad "${roh}" enthaelt einen Backslash.`, "Paketpfade nutzen /.");
  }
  if (pfad.includes(":")) {
    return fehler(`Der Pfad "${roh}" enthaelt einen Doppelpunkt.`);
  }
  if (pfad.split("/").some((teil) => teil === ".." || teil === ".")) {
    return fehler(`Der Pfad "${roh}" enthaelt ein Verzeichniswechsel-Segment.`);
  }
  return pfad;
}

function pruefeTyp(contentType: string, pfad: string): string | Ergebnis {
  const typ = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (typ === "") return fehler(`Fuer "${pfad}" fehlt der contentType.`);
  if (!ERLAUBTE_TYPEN.includes(typ)) {
    return fehler(
      `Der contentType "${typ}" ist fuer Anhaenge nicht zugelassen.`,
      `Erlaubt sind: ${ERLAUBTE_TYPEN.join(", ")}.`,
    );
  }
  return typ;
}

/**
 * Loest die drei Quellen in Bytes auf.
 *
 * Die Quellen sind bewusst verschieden gut: `url` ist der Regelfall bei
 * Herstellerdokumenten, `base64` fuer Kleinkram aus dem Chat, `token` fuer alles andere.
 */
async function loeseAnhaenge(
  umgebung: Umgebung,
  liste: readonly AnhangsEingabe[],
): Promise<Map<string, Attachment> | Ergebnis> {
  if (liste.length > MAX_ANHAENGE) {
    return fehler(`Mehr als ${MAX_ANHAENGE} Anhaenge je Container sind nicht vorgesehen.`);
  }

  const ablage = anhangsAblage(umgebung.env);
  const map = new Map<string, Attachment>();
  let summe = 0;

  for (const eintrag of liste) {
    const pfad = pruefePaketpfad(eintrag.pfad ?? "");
    if (istErgebnis(pfad)) return pfad;

    const quellen = [eintrag.url, eintrag.base64, eintrag.token].filter(
      (q) => typeof q === "string" && q.trim() !== "",
    );
    if (quellen.length === 0) {
      return fehler(`Fuer "${pfad}" fehlt die Quelle.`, "Genau eines aus url, base64, token.");
    }
    if (quellen.length > 1) {
      return fehler(
        `Fuer "${pfad}" sind mehrere Quellen angegeben.`,
        "Genau eines aus url, base64, token.",
      );
    }

    let bytes: Uint8Array;
    let typ = eintrag.contentType ?? "";

    if (typeof eintrag.url === "string" && eintrag.url.trim() !== "") {
      try {
        const geholt = await holeSicher(eintrag.url.trim(), MAX_ANHANG_BYTES, {
          erlaubt: umgebung.env.mcpNetzErlaubt,
        });
        bytes = geholt.bytes;
        if (typ === "") typ = geholt.contentType;
      } catch (ursache) {
        if (ursache instanceof NetzFehler) return fehler(`"${pfad}": ${ursache.message}`);
        throw ursache;
      }
    } else if (typeof eintrag.base64 === "string" && eintrag.base64.trim() !== "") {
      // Streng, nicht nachsichtig: `Buffer.from(x, "base64")` schneidet am ersten
      // ungueltigen Zeichen still ab, und genau so sind halbe Bilder durchgekommen.
      const gelesen = ausBase64(eintrag.base64);
      if (istBytesFehler(gelesen)) return fehler(`"${pfad}": ${gelesen.grund}`, gelesen.hinweis);
      if (gelesen.byteLength > MAX_BASE64_BYTES) {
        return fehler(
          `"${pfad}": ueber base64 sind hoechstens ${MAX_BASE64_BYTES / 1024 / 1024} MB vorgesehen.`,
          "Groesseres ueber POST /api/mcp/anhaenge hochladen und den Token angeben.",
        );
      }
      bytes = gelesen;
    } else {
      const token = String(eintrag.token).trim();
      const abruf = ablage.abrufen(token, umgebung.benutzer);
      if (abruf === null) {
        return fehler(
          `"${pfad}": der Token ist unbekannt oder abgelaufen.`,
          `Hochgeladene Anhaenge sind ${ablage.lebensdauerMs / 3600000} Stunden gueltig.`,
        );
      }
      // Ein Upload, dessen letzter Teil noch aussteht, ist kein Anhang. Ohne diese
      // Sperre landet die halbe Datei im Container, und der Token sah dabei gueltig aus.
      if (abruf.info.unvollstaendig === true) {
        return fehler(
          `"${pfad}": der Upload zu diesem Token ist noch nicht abgeschlossen ` +
            `(${abruf.info.teil ?? 0} Teile, ${abruf.bytes.byteLength} Bytes).`,
          "Den letzten Teil mit letzter=true und sha256 an anhang_hochladen geben.",
        );
      }
      bytes = new Uint8Array(abruf.bytes);
      if (typ === "") typ = abruf.info.contentType;
    }

    const geprueft = pruefeTyp(typ, pfad);
    if (istErgebnis(geprueft)) return geprueft;

    // Zusage und Signatur fuer **jede** Quelle, nicht nur fuer base64: auch eine url kann
    // abgeschnitten antworten, und dann steht es in den letzten Bytes.
    const zusage = pruefeZusage(bytes, eintrag, pfad);
    if (zusage !== null) return fehler(zusage.grund, zusage.hinweis);
    const signatur = pruefeSignatur(bytes, geprueft, pfad);
    if (signatur !== null) return fehler(signatur.grund, signatur.hinweis);

    if (bytes.byteLength > MAX_ANHANG_BYTES) {
      return fehler(`"${pfad}" ist groesser als ${MAX_ANHANG_BYTES / 1024 / 1024} MB.`);
    }
    summe += bytes.byteLength;
    if (summe > MAX_CONTAINER_BYTES) {
      return fehler(
        `Die Anhaenge zusammen ueberschreiten ${MAX_CONTAINER_BYTES / 1024 / 1024} MB.`,
      );
    }

    map.set(pfad, { path: pfad, contentType: geprueft, bytes });
  }

  return map;
}

/** Der Pfad aus `assetInformation.defaultThumbnail`, sofern eine Schale einen setzt. */
function thumbnailPfad(environment: JsonObject): string | null {
  const shells = environment["assetAdministrationShells"];
  if (!Array.isArray(shells)) return null;
  for (const shell of shells) {
    if (!istObjekt(shell)) continue;
    const info = shell["assetInformation"];
    if (!istObjekt(info)) continue;
    const thumb = info["defaultThumbnail"];
    if (!istObjekt(thumb)) continue;
    const pfad = thumb["path"];
    if (typeof pfad === "string" && pfad.trim() !== "") return normalizePath(pfad.trim());
  }
  return null;
}

/**
 * Dieselben Bytes ein zweites Mal, unter dem Namen, an dem ein Paketleser die Vorschau
 * sucht.
 *
 * Zwei Wege, und beide werden gebraucht: der AASX Package Explorer nimmt die Vorschau
 * ueber die OPC-Beziehung im Wurzel-`_rels`, ein Repository ueber `defaultThumbnail`. Das
 * kostet die doppelten Bytes einer kleinen Datei und spart die Frage, warum die Vorschau
 * je nach Programm fehlt. Die Endung folgt der Originaldatei, ein JPEG heisst nicht .png.
 */
function alsThumbnail(anhang: Attachment): Attachment {
  const punkt = anhang.path.lastIndexOf(".");
  const endung = punkt > 0 ? anhang.path.slice(punkt) : ".png";
  return { path: `/thumbnail${endung}`, contentType: anhang.contentType, bytes: anhang.bytes };
}

// --- gemeinsamer Vorlauf --------------------------------------------------------------

interface Befund {
  readonly schwere: "verstoss" | "warnung";
  readonly regel: string | null;
  readonly pfad: string;
  readonly feld?: string;
  readonly text: string;
}

interface Gelesen {
  readonly model: ReturnType<typeof normalize>;
  readonly environment: JsonObject;
  readonly befunde: Befund[];
  /** Welche leeren Listen entfernt wurden, siehe `entferneLeereListen`. */
  readonly normalisiert: string[];
  /**
   * Ob sich aus dem Modell ueberhaupt eine Datei schreiben laesst.
   *
   * Falsch heisst: ein Pflichtfeld fehlt ganz. Die SDK kann das Modell dann nicht
   * einmal aufbauen, und damit gibt es auch nichts zu schreiben. Ein falscher **Wert**
   * ist etwas anderes, der kommt als gewoehnlicher Verstoss durch die Pruefung.
   */
  readonly schreibbar: boolean;
}

const WARNUNGSTEXT: Readonly<Record<string, string>> = {
  "warnung.fehlenderAnhang":
    "Ein File-Element verweist auf einen Paketpfad, zu dem kein Anhang vorliegt.",
  "warnung.doppelteId": "Dieselbe fachliche id kommt mehrfach vor.",
  "warnung.doppelterIdShort": "Derselbe idShort kommt unter denselben Geschwistern mehrfach vor.",
};

function alsText(befund: ValidationIssue): string {
  if (befund.message !== "") return befund.message;
  const vorlage = befund.schluessel === null ? undefined : WARNUNGSTEXT[befund.schluessel];
  return vorlage ?? befund.schluessel ?? "Warnung ohne Text.";
}

/**
 * Der Pfad der Wurzel.
 *
 * `verify()` gibt fuer eine Verletzung am Environment selbst einen **leeren** Pfad
 * zurueck, und ein leeres Feld liest sich wie eine fehlende Angabe. Genau daran ist am
 * 10.08.2026 jemand haengen geblieben: der einzige Befund kam mit `pfad: ""`.
 */
const WURZEL = "$";

function alsBefund(issue: ValidationIssue): Befund {
  return {
    schwere: issue.severity === "constraint" ? "verstoss" : "warnung",
    regel: issue.constraintId,
    pfad: issue.aasPath === "" ? WURZEL : issue.aasPath,
    ...(issue.field === "" ? {} : { feld: issue.field }),
    text: alsText(issue),
  };
}

/**
 * Leere Listen am Environment sind gemeint als "keine", das Metamodell wertet sie als
 * Verstoss ("must be either not set or have at least one item").
 *
 * Formal hat es recht, praktisch ist es ein Stolperstein: `"conceptDescriptions": []` ist
 * offensichtlich als "keine" geschrieben. Sie fallen deshalb weg, **aber nicht still**:
 * was entfernt wurde, steht als `normalisiert` in der Antwort. Eine Eingabe klammheimlich
 * zu aendern waere schlimmer als der Verstoss.
 */
const OBERSTE_LISTEN = ["assetAdministrationShells", "submodels", "conceptDescriptions"] as const;

function entferneLeereListen(environment: JsonObject): string[] {
  const entfernt: string[] = [];
  for (const name of OBERSTE_LISTEN) {
    const wert = environment[name];
    if (Array.isArray(wert) && wert.length === 0) {
      delete environment[name];
      entfernt.push(name);
    }
  }
  return entfernt;
}

/** Den uebergebenen Text als Environment lesen, mit einer Groessengrenze davor. */
function alsEnvironment(roh: string): JsonObject | Ergebnis {
  if (roh.length > MAX_EINGABE) {
    return fehler(
      `Die Eingabe ist ${Math.round(roh.length / 1024)} KB gross, erlaubt sind ${MAX_EINGABE / 1024 / 1024} MB.`,
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(roh);
  } catch (ursache) {
    return fehler(
      `Die Eingabe ist kein gueltiges JSON: ${(ursache as Error).message}`,
      "environment wird als JSON-Text uebergeben, nicht als Objekt.",
    );
  }

  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return fehler("environment muss ein JSON-Objekt sein.", "Erwartet wird ein AAS Environment.");
  }
  return json as JsonObject;
}

/**
 * Normalisieren und pruefen. Der Weg, den alle Werkzeuge mit einem Environment gehen.
 *
 * @param pfade Die vorhandenen Paketpfade. Ohne sie meldet die Pruefung jedes
 * File-Element als fehlenden Anhang, und genau das war der Grund, warum die Warnung
 * bisher nichts wert war.
 */
async function pruefeEnvironment(
  environment: JsonObject,
  pfade: Set<string>,
): Promise<Gelesen | Ergebnis> {
  const normalisiert = entferneLeereListen(environment);

  let model: ReturnType<typeof normalize>;
  try {
    model = normalize(environment);
  } catch (ursache) {
    return fehler(`Das Environment liess sich nicht lesen: ${(ursache as Error).message}`);
  }

  try {
    const issues = await validate(model, pfade);
    return {
      model,
      environment,
      normalisiert,
      befunde: issues.map(alsBefund),
      schreibbar: true,
    };
  } catch (ursache) {
    /*
     * Ein fehlendes Pflichtfeld ist kein Werkzeugfehler, es ist der haeufigste Befund
     * ueberhaupt und muss als solcher herauskommen. Die SDK kann das Modell dann zwar
     * nicht aufbauen und die Pruefung faellt aus, aber die Meldung nennt Grund und
     * Pfad, und genau damit repariert das Modell seinen Entwurf.
     */
    if (istKernFehler(ursache) && ursache.schluessel === "modell.nichtZurueckwandelbar") {
      const pfad = String(ursache.werte["pfad"] ?? "");
      return {
        model,
        environment,
        normalisiert,
        schreibbar: false,
        befunde: [
          {
            schwere: "verstoss",
            regel: null,
            pfad: pfad === "" ? WURZEL : pfad,
            text: String(ursache.werte["grund"] ?? ursache.message),
          },
        ],
      };
    }
    return fehler(`Die Pruefung brach ab: ${(ursache as Error).message}`);
  }
}

function befundeAusgabe(befunde: readonly Befund[]): Record<string, unknown> {
  return {
    verstoesse: befunde.filter((b) => b.schwere === "verstoss").length,
    warnungen: befunde.filter((b) => b.schwere === "warnung").length,
    befunde: befunde.slice(0, MAX_BEFUNDE),
    ...(befunde.length > MAX_BEFUNDE ? { abgeschnitten: befunde.length - MAX_BEFUNDE } : {}),
  };
}

function urteilVon(gelesen: Gelesen): string {
  if (!gelesen.schreibbar) {
    return (
      "Ein Pflichtfeld fehlt ganz, deshalb konnte nur bis dorthin gelesen werden. " +
      "Nach dem Ergaenzen erneut pruefen, weitere Befunde koennen dahinter liegen."
    );
  }
  if (gelesen.befunde.length === 0) return "Das Environment ist gueltig.";
  return (
    "Bitte die Verstoesse beheben und erneut pruefen. Warnungen sind kein Verstoss " +
    "gegen das Metamodell."
  );
}

// --- Anhangsbilanz --------------------------------------------------------------------

interface Dateiverweis {
  readonly aasPath: string;
  readonly wert: string;
}

/**
 * Alle `File`-Elemente mit ihrem Wert, **einschliesslich** der externen Verweise.
 *
 * `collectFileReferences` im Kern ueberspringt externe Verweise absichtlich, weil sie kein
 * Paketanhang sind und dort nicht geprueft werden sollen. Hier ist die Frage eine andere:
 * der Aufrufer will wissen, was aus jedem einzelnen File-Element geworden ist. Deshalb
 * steht die Aufzaehlung hier und nicht im Kern.
 */
function dateiverweise(model: ReturnType<typeof normalize>): Dateiverweis[] {
  const index = buildPathIndex(model);
  const out: Dateiverweis[] = [];
  for (const node of walk(model)) {
    if (node.kind !== "File") continue;
    const wert = node.data["value"];
    if (typeof wert !== "string" || wert === "") continue;
    out.push({ aasPath: index.byNode.get(node.nodeId) ?? "", wert });
  }
  return out;
}

const IST_EXTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

interface Bilanz {
  /**
   * Je Datei **ein** Eintrag, mit der Zahl der Verweise darauf.
   *
   * Bis zum 10.08.2026 stand hier ein Eintrag je File-Element, und eine Datei, auf die
   * zwei Elemente zeigen, sah aus wie ein Duplikatfehler in der Antwort. Der Zaehler sagt
   * dasselbe kuerzer und ist zugleich die interessantere Auskunft: geteilte Dateien sind
   * die, bei denen ein Ersetzen zwei Stellen trifft.
   */
  readonly aufgeloest: { pfad: string; verweise: number }[];
  readonly fehlend: { pfad: string; aasPath: string }[];
  readonly extern: { url: string; aasPath: string }[];
  readonly unreferenziert: string[];
}

/**
 * Was aus jedem File-Element geworden ist, und die Gegenrichtung dazu.
 *
 * Die Gegenrichtung gibt es sonst nirgends: ein Anhang, auf den kein File-Element und
 * kein defaultThumbnail zeigt, faellt beim Export nicht auf, liegt aber im Container und
 * blaeht ihn auf. Beim Zusammensetzen aus mehreren Quellen ist das ein haeufiger Fehler.
 */
function bilanziere(
  model: ReturnType<typeof normalize>,
  environment: JsonObject,
  pfade: Set<string>,
): Bilanz {
  const aufgeloest = new Map<string, number>();
  const fehlend: { pfad: string; aasPath: string }[] = [];
  const extern: { url: string; aasPath: string }[] = [];

  for (const verweis of dateiverweise(model)) {
    if (IST_EXTERN.test(verweis.wert)) {
      extern.push({ url: verweis.wert, aasPath: verweis.aasPath });
      continue;
    }
    const pfad = normalizePath(verweis.wert);
    if (pfade.has(pfad)) {
      aufgeloest.set(pfad, (aufgeloest.get(pfad) ?? 0) + 1);
    } else {
      fehlend.push({ pfad, aasPath: verweis.aasPath });
    }
  }

  // Das Vorschaubild zaehlt als Verweis: sonst gilt die Datei, auf die nur es zeigt, als
  // unreferenziert und der Aufrufer entfernt sie.
  const thumb = thumbnailPfad(environment);
  if (thumb !== null && pfade.has(thumb)) {
    aufgeloest.set(thumb, (aufgeloest.get(thumb) ?? 0) + 1);
  }

  return {
    aufgeloest: [...aufgeloest].map(([pfad, verweise]) => ({ pfad, verweise })),
    fehlend,
    extern,
    unreferenziert: [...pfade].filter((pfad) => !aufgeloest.has(pfad)),
  };
}

// --- Entwuerfe ------------------------------------------------------------------------

/**
 * Der Entwurf: ein Environment, das auf dem Server liegen bleibt.
 *
 * **Der groesste Posten des ganzen Ablaufs.** Ohne ihn geht das vollstaendige Environment
 * bei jedem Pruefen und jedem Erzeugen erneut ueber die Leitung, und bei mehreren
 * Korrekturrunden ist das um ein Vielfaches mehr als die AAS selbst. Gemeldet aus einer
 * echten Sitzung am 10.08.2026: 34 KB, zweimal, je Runde.
 *
 * Der Server bleibt trotzdem ohne Datenbank und ohne Benutzer. Ein Entwurf ist eine Datei
 * mit einem nicht zu ratenden Namen und einer Frist, genau wie eine Ausgabe oder ein
 * hochgeladener Anhang.
 */
function entwurfLesen(umgebung: Umgebung, token: string): JsonObject | Ergebnis {
  const abruf = entwuerfe(umgebung.env).abrufen(token.trim(), umgebung.benutzer);
  if (abruf === null) {
    return fehler(
      "Der Entwurf ist unbekannt oder abgelaufen.",
      `Entwuerfe gelten ${entwuerfe(umgebung.env).lebensdauerMs / 3600000} Stunden ab der ` +
        "letzten Aenderung. Mit entwurf_anlegen einen neuen anlegen.",
    );
  }
  const environment = alsEnvironment(abruf.bytes.toString("utf8"));
  return environment;
}

function alsBytes(environment: JsonObject): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(environment));
}

function entwurfSchreiben(umgebung: Umgebung, environment: JsonObject): string {
  const info = entwuerfe(umgebung.env).ablegen({
    bytes: alsBytes(environment),
    dateiname: "entwurf.json",
    contentType: "application/json",
    eigentuemer: umgebung.benutzer,
  });
  return info.token;
}

/**
 * Die Quelle eines Werkzeugs: entweder der volle Text oder ein Entwurf.
 *
 * Genau eines von beidem. Beides zugleich hiesse, dass zwei Staende im Umlauf sind, und
 * keines von beidem ist ein Aufruf ohne Gegenstand.
 */
function quelleVon(
  umgebung: Umgebung,
  eingabe: { environment?: string | null; entwurf?: string | null },
): JsonObject | Ergebnis {
  const text = eingabe.environment?.trim() ?? "";
  const token = eingabe.entwurf?.trim() ?? "";

  if (text !== "" && token !== "") {
    return fehler("environment und entwurf schliessen sich aus.", "Genau eines von beidem.");
  }
  if (text === "" && token === "") {
    return fehler("Es fehlt die Quelle.", "Entweder environment als JSON-Text oder entwurf.");
  }
  return text !== "" ? alsEnvironment(text) : entwurfLesen(umgebung, token);
}

/** Die gemeinsame Antwort von anlegen, aendern und pruefen. */
async function berichte(
  gelesen: Gelesen,
  pfade: Set<string>,
  zusatz: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const bilanz = bilanziere(gelesen.model, gelesen.environment, pfade);
  return {
    ...zusatz,
    ...befundeAusgabe(gelesen.befunde),
    ...(gelesen.normalisiert.length === 0
      ? {}
      : {
          normalisiert: gelesen.normalisiert,
          normalisierungshinweis:
            "Diese Listen waren leer und wurden entfernt. Das Metamodell laesst eine leere " +
            "Liste nicht zu; gemeint war offensichtlich „keine\", und genau das ist jetzt " +
            "der Zustand.",
        }),
    anhaenge: {
      aufgeloest: bilanz.aufgeloest,
      fehlend: bilanz.fehlend,
      extern: bilanz.extern,
      unreferenziert: bilanz.unreferenziert,
    },
    urteil: urteilVon(gelesen),
    ...(bilanz.unreferenziert.length > 0
      ? {
          anhangswarnung:
            "Auf diese Anhaenge zeigt kein File-Element und kein defaultThumbnail. Sie " +
            "landen im Container, ohne dass sie jemand findet.",
        }
      : {}),
  };
}

function anhangspfade(liste: readonly string[] | null | undefined): Set<string> {
  return new Set((liste ?? []).map((p) => normalizePath(String(p).trim())));
}

export interface TeilmodellWunsch {
  readonly kennung: string;
  readonly id?: string | null;
  readonly idShort?: string | null;
  readonly werte?: Readonly<Record<string, JsonValue>> | null;
}

export interface AnlegeEingabe {
  readonly environment?: string | null;
  readonly kopf?: SchalenKopf | null;
  readonly teilmodelle?: readonly TeilmodellWunsch[] | null;
  readonly anhaenge?: readonly string[] | null;
}

/**
 * Ein Entwurf, entweder aus einem fertigen Environment oder aus Vorlagen gebaut.
 *
 * Der zweite Weg ist seit dem 10.08.2026 der bessere und der Grund fuer diese Runde. Bis
 * dahin musste das vollstaendige Environment einmal geschickt werden, und fuer drei
 * Teilmodelle waren das rund fuenfhundert Zeilen, von denen vier Fuenftel reine
 * semanticId-Boilerplate waren. Mit `kopf` und `teilmodelle` baut der Server Schale,
 * Teilmodelle und die Verweise dazwischen selbst; ueber die Leitung gehen nur noch die
 * Werte aus dem Datenblatt.
 *
 * `environment` bleibt fuer alles, was nicht nach einer IDTA-Vorlage gebaut wird.
 */
export async function entwurfAnlegen(
  umgebung: Umgebung,
  eingabe: AnlegeEingabe,
): Promise<Ergebnis> {
  const roh = eingabe.environment ?? "";
  const ausVorlagen = eingabe.kopf != null || (eingabe.teilmodelle?.length ?? 0) > 0;

  if (roh.trim() !== "" && ausVorlagen) {
    return fehler(
      "environment und kopf/teilmodelle schliessen sich aus.",
      "Entweder ein fertiges Environment schicken oder es aus Vorlagen bauen lassen.",
    );
  }
  if (roh.trim() === "" && !ausVorlagen) {
    return fehler(
      "Es fehlt die Angabe, woraus der Entwurf entstehen soll.",
      "Entweder environment mit dem vollstaendigen JSON, oder kopf und teilmodelle, dann " +
        "baut der Server das Geruest aus den IDTA-Vorlagen. Der zweite Weg spart die " +
        "gesamte semanticId-Boilerplate.",
    );
  }

  let environment: JsonObject;
  let bauplan: Bauplan | null = null;

  if (ausVorlagen) {
    const gebaut = baueAusVorlagen(eingabe);
    if (istErgebnis(gebaut)) return gebaut;
    environment = gebaut.environment;
    bauplan = gebaut;
  } else {
    const gelesenesEnv = alsEnvironment(roh);
    if (istErgebnis(gelesenesEnv)) return gelesenesEnv;
    environment = gelesenesEnv;
  }

  const pfade = anhangspfade(eingabe.anhaenge);
  const gelesen = await pruefeEnvironment(environment, pfade);
  if (istErgebnis(gelesen)) return gelesen;

  // Abgelegt wird der **normalisierte** Stand, sonst kaeme der Verstoss ueber leere Listen
  // bei jedem Patch aufs Neue.
  const token = entwurfSchreiben(umgebung, gelesen.environment);

  return gib(
    await berichte(gelesen, pfade, {
      entwurf: token,
      ...(bauplan === null
        ? {}
        : {
            gebaut: bauplan.bericht,
            offen: bauplan.offen,
            ...(bauplan.maengel.length === 0 ? {} : { bekannteMaengel: bauplan.maengel }),
          }),
      hinweis:
        "Ab jetzt genuegt entwurf statt environment: entwurf_aendern fuer Korrekturen, " +
        "teilmodell_erzeugen fuer ein weiteres Teilmodell nach Vorlage, " +
        "aas_datei_erzeugen fuer die Datei. Das Environment muss nicht noch einmal " +
        "geschickt werden." +
        (bauplan === null
          ? ""
          : " Wo TODO steht, verlangt das Metamodell einen nicht leeren Wert; das steht " +
            "unter offen und ist zu ersetzen, nicht zu loeschen."),
    }),
  );
}

interface Bauplan {
  readonly environment: JsonObject;
  readonly bericht: JsonObject;
  readonly offen: JsonObject;
  readonly maengel: readonly string[];
}

/** Schale, Teilmodelle und die Verweise dazwischen, aus den IDTA-Vorlagen. */
function baueAusVorlagen(eingabe: AnlegeEingabe): Bauplan | Ergebnis {
  const wuensche = eingabe.teilmodelle ?? [];
  if (wuensche.length === 0) {
    return fehler(
      "teilmodelle ist leer.",
      `Mindestens eine Vorlagenkennung angeben. Erlaubt: ${KENNUNGEN.join(", ")}.`,
    );
  }

  const submodels: JsonObject[] = [];
  const bericht: JsonObject = {};
  const offen: JsonObject = {};
  const maengel: string[] = [];

  for (const wunsch of wuensche) {
    const gebaut = baueTeilmodell(wunsch);
    if (istErgebnis(gebaut)) return gebaut;

    submodels.push(gebaut.submodel);
    const name = String(gebaut.submodel["idShort"] ?? wunsch.kennung);
    bericht[name] = {
      kennung: wunsch.kennung,
      id: String(gebaut.submodel["id"] ?? ""),
      gesetzt: gebaut.gesetzt.length,
    };
    if (gebaut.offen.length > 0) offen[name] = gebaut.offen.map((o) => o.pfad);
    maengel.push(...maengelVon(wunsch.kennung));
  }

  const environment: JsonObject = { submodels };
  if (eingabe.kopf != null) {
    const globalAssetId = eingabe.kopf.globalAssetId?.trim() ?? "";
    if (globalAssetId === "") {
      return fehler(
        "kopf.globalAssetId fehlt.",
        "Jede Schale braucht die Kennung ihres Assets, etwa eine IRI oder eine IEC 61406 " +
          "ID-Link-Adresse.",
      );
    }
    environment["assetAdministrationShells"] = [schaleBauen(eingabe.kopf, submodels)];
  }

  return { environment, bericht, offen, maengel: [...new Set(maengel)] };
}

function baueTeilmodell(wunsch: TeilmodellWunsch): Instanz | Ergebnis {
  const kennung = wunsch.kennung?.trim() ?? "";
  const eintrag = vorlageVon(kennung);
  if (eintrag === undefined) {
    return fehler(
      `Die Vorlage "${kennung}" gibt es nicht.`,
      `Erlaubt: ${KENNUNGEN.join(", ")}. Ohne kennung listet aas_vorlage sie auf.`,
    );
  }

  const gebaut = instanzErzeugen(eintrag, wunsch.werte ?? {}, {
    id: wunsch.id ?? null,
    idShort: wunsch.idShort ?? null,
  });
  if (istPfadFehler(gebaut)) {
    return fehler(`${kennung}: ${gebaut.grund}`, gebaut.hinweis);
  }
  return gebaut;
}

// --- teilmodell_erzeugen --------------------------------------------------------------

/**
 * Ein Teilmodell nach Vorlage, wahlweise gleich in einen Entwurf hinein.
 *
 * Mit `entwurf` geht **kein** Teilmodell-JSON zurueck durch die Leitung: es entsteht im
 * Server, wird angehaengt, der Entwurf wird geprueft, und zurueck kommen Befunde und
 * Bilanz. Ohne `entwurf` kommt es als JSON, fuer den Fall, dass es woandershin soll.
 */
export async function teilmodellErzeugen(
  umgebung: Umgebung,
  eingabe: {
    kennung: string;
    werte?: Readonly<Record<string, JsonValue>> | null;
    id?: string | null;
    idShort?: string | null;
    entwurf?: string | null;
    anhaenge?: readonly string[] | null;
  },
): Promise<Ergebnis> {
  const gebaut = baueTeilmodell(eingabe);
  if (istErgebnis(gebaut)) return gebaut;

  const gemeldet = {
    gesetzt: gebaut.gesetzt,
    ...(gebaut.offen.length === 0
      ? {}
      : {
          offen: gebaut.offen.map((o) => `${o.pfad} (${o.modelType})`),
          offenHinweis:
            "Diese Pflichtelemente stehen auf ihrem Platzhalter TODO. Sie bestehen die " +
            "Pruefung, sind aber nicht ausgefuellt: ersetzen, nicht loeschen.",
        }),
    ...(maengelVon(eingabe.kennung.trim()).length === 0
      ? {}
      : { bekannteMaengel: maengelVon(eingabe.kennung.trim()) }),
  };

  const token = (eingabe.entwurf ?? "").trim();
  if (token === "") {
    return gib({
      ...gemeldet,
      submodel: gebaut.submodel,
      hinweis:
        "Ohne entwurf kommt das Teilmodell als JSON zurueck. Mit entwurf haengt der Server " +
        "es direkt an und schickt gar kein JSON: das ist der Weg, der Uebertragung spart.",
    });
  }

  const environment = entwurfLesen(umgebung, token);
  if (istErgebnis(environment)) return environment;

  const submodels = Array.isArray(environment["submodels"])
    ? [...(environment["submodels"] as JsonValue[])]
    : [];

  const id = String(gebaut.submodel["id"] ?? "");
  if (submodels.some((sm) => istJsonObjekt(sm) && sm["id"] === id)) {
    return fehler(
      `Im Entwurf steht bereits ein Teilmodell mit der id "${id}".`,
      "Eine eigene id ueber den Parameter id vergeben, oder das vorhandene mit " +
        "entwurf_aendern anpassen.",
    );
  }
  submodels.push(gebaut.submodel);
  environment["submodels"] = submodels;

  /*
   * Den Verweis von der Schale mitzuziehen ist kein Beiwerk. Ihn zu vergessen war in der
   * echten Sitzung eine eigene Korrekturrunde: das Teilmodell stand im Environment, die
   * Schale kannte es nicht, und aufgefallen ist es erst beim Lesen der fertigen Datei.
   */
  let verknuepft = false;
  const shells = environment["assetAdministrationShells"];
  if (Array.isArray(shells) && istJsonObjekt(shells[0])) {
    const schale = shells[0];
    const verweise = Array.isArray(schale["submodels"]) ? [...schale["submodels"]] : [];
    verweise.push(verweisAuf(id));
    schale["submodels"] = verweise;
    verknuepft = true;
  }

  const pfade = anhangspfade(eingabe.anhaenge);
  const gelesen = await pruefeEnvironment(environment, pfade);
  if (istErgebnis(gelesen)) return gelesen;

  if (
    entwuerfe(umgebung.env).aktualisieren(
      token,
      umgebung.benutzer,
      alsBytes(gelesen.environment),
    ) === null
  ) {
    return fehler("Der Entwurf ist zwischenzeitlich abgelaufen.");
  }

  return gib(
    await berichte(gelesen, pfade, {
      entwurf: token,
      ...gemeldet,
      angehaengt: { idShort: gebaut.submodel["idShort"], id, verknuepft },
      hinweis: verknuepft
        ? "Angehaengt und von der Schale verwiesen. Das Teilmodell selbst ging nicht " +
          "ueber die Leitung; mit entwurf_lesen nachsehen, falls ein Index gebraucht wird."
        : "Angehaengt. Der Entwurf fuehrt keine Schale, deshalb gibt es keinen Verweis " +
          "darauf; das ist zulaessig, aber selten gewollt.",
    }),
  );
}

function istJsonObjekt(wert: unknown): wert is JsonObject {
  return typeof wert === "object" && wert !== null && !Array.isArray(wert);
}

export async function entwurfAendern(
  umgebung: Umgebung,
  eingabe: { entwurf: string; patches: readonly Patch[]; anhaenge?: readonly string[] | null },
): Promise<Ergebnis> {
  const token = eingabe.entwurf.trim();
  const vorher = entwurfLesen(umgebung, token);
  if (istErgebnis(vorher)) return vorher;

  if (eingabe.patches.length === 0) {
    return fehler("Es wurde kein Patch uebergeben.", "Zum blossen Nachsehen entwurf_lesen.");
  }

  let nachher: JsonObject;
  try {
    nachher = wendeAn(vorher, eingabe.patches);
  } catch (ursache) {
    if (ursache instanceof ZeigerFehler) {
      /*
       * Der Entwurf bleibt unveraendert: `wendeAn` arbeitet auf einer Kopie. Ein halb
       * angewandter Stapel waere schlimmer als ein abgelehnter, der Aufrufer wuesste
       * danach nicht mehr, was drinsteht.
       */
      return fehler(ursache.message, "Der Entwurf ist unveraendert. Mit entwurf_lesen nachsehen.");
    }
    throw ursache;
  }

  const pfade = anhangspfade(eingabe.anhaenge);
  const gelesen = await pruefeEnvironment(nachher, pfade);
  if (istErgebnis(gelesen)) return gelesen;

  const bytes = new TextEncoder().encode(JSON.stringify(gelesen.environment));
  if (entwuerfe(umgebung.env).aktualisieren(token, umgebung.benutzer, bytes) === null) {
    return fehler("Der Entwurf ist zwischenzeitlich abgelaufen.");
  }

  return gib(
    await berichte(gelesen, pfade, {
      entwurf: token,
      angewandt: eingabe.patches.length,
    }),
  );
}

export function entwurfAnsehen(
  umgebung: Umgebung,
  eingabe: { entwurf: string; pfad?: string | null },
): Ergebnis {
  const environment = entwurfLesen(umgebung, eingabe.entwurf);
  if (istErgebnis(environment)) return environment;

  const pfad = eingabe.pfad?.trim() ?? "";
  if (pfad === "") return gib({ entwurf: eingabe.entwurf.trim(), environment });

  let ausschnitt: JsonValue | undefined;
  try {
    ausschnitt = zeigerLesen(environment, pfad);
  } catch (ursache) {
    if (ursache instanceof ZeigerFehler) return fehler(ursache.message);
    throw ursache;
  }
  if (ausschnitt === undefined) {
    return fehler(`Unter "${pfad}" steht nichts.`, "Ohne pfad kommt das ganze Environment.");
  }
  return gib({ entwurf: eingabe.entwurf.trim(), pfad, wert: ausschnitt });
}

// --- aas_pruefen ----------------------------------------------------------------------

export async function aasPruefen(
  umgebung: Umgebung,
  eingabe: {
    environment?: string | null;
    entwurf?: string | null;
    anhaenge?: readonly string[] | null;
  },
): Promise<Ergebnis> {
  const environment = quelleVon(umgebung, eingabe);
  if (istErgebnis(environment)) return environment;

  const pfade = anhangspfade(eingabe.anhaenge);
  const gelesen = await pruefeEnvironment(environment, pfade);
  if (istErgebnis(gelesen)) return gelesen;

  return gib(await berichte(gelesen, pfade));
}

// --- aas_datei_erzeugen ---------------------------------------------------------------

const ENDUNG: Readonly<Record<AasFormat, string>> = {
  json: ".json",
  xml: ".xml",
  aasx: ".aasx",
};

/**
 * Macht aus einem gewuenschten Namen einen, der sich gefahrlos in einen
 * `Content-Disposition`-Kopf schreiben laesst.
 */
function sauberName(wunsch: string | null | undefined, format: AasFormat): string {
  const roh = (wunsch ?? "").trim().replace(/\.(json|xml|aasx)$/i, "");
  const gesaeubert = roh.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  const basis = gesaeubert === "" ? "environment" : gesaeubert.slice(0, 80);
  return `${basis}${ENDUNG[format]}`;
}

export async function aasDateiErzeugen(
  umgebung: Umgebung,
  eingabe: {
    environment?: string | null;
    entwurf?: string | null;
    format: AasFormat;
    dateiname?: string | null;
    anhaenge?: readonly AnhangsEingabe[] | null;
  },
): Promise<Ergebnis> {
  const quelle = quelleVon(umgebung, eingabe);
  if (istErgebnis(quelle)) return quelle;

  const liste = eingabe.anhaenge ?? [];

  // Stilles Verwerfen waere hier das Schlimmste: der Aufrufer glaubte, sein Datenblatt
  // sei dabei, und bekaeme eine Datei, in der es nicht ist.
  if (liste.length > 0 && eingabe.format !== "aasx") {
    return fehler(
      `Anhaenge gibt es nur im AASX-Container, nicht im Format "${eingabe.format}".`,
      "format auf aasx setzen, oder die Anhaenge weglassen.",
    );
  }

  const geloest = liste.length > 0 ? await loeseAnhaenge(umgebung, liste) : new Map();
  if (istErgebnis(geloest)) return geloest;
  const anhangsMap = geloest as Map<string, Attachment>;

  const gelesen = await pruefeEnvironment(quelle, new Set(anhangsMap.keys()));
  if (istErgebnis(gelesen)) return gelesen;

  /*
   * Fehlt ein Pflichtfeld ganz, gibt es nichts zu schreiben: die SDK baut das Modell
   * gar nicht erst auf. Das ist die eine Stelle, an der keine Datei entsteht, und die
   * Befunde muessen deshalb mitkommen, sonst steht das Modell ohne Anhaltspunkt da.
   */
  if (!gelesen.schreibbar) {
    return {
      text: JSON.stringify(
        {
          fehler: "Es wurde keine Datei geschrieben: ein Pflichtfeld fehlt.",
          ...befundeAusgabe(gelesen.befunde),
          hinweis: urteilVon(gelesen),
        },
        null,
        2,
      ),
      istFehler: true,
    };
  }

  const thumbPfad = thumbnailPfad(gelesen.environment);
  const thumbAnhang = thumbPfad === null ? undefined : anhangsMap.get(thumbPfad);

  let datei: Awaited<ReturnType<typeof exportFile>>;
  try {
    datei = await exportFile({
      model: gelesen.model,
      format: eingabe.format,
      attachments: anhangsMap,
      ...(thumbAnhang === undefined ? {} : { thumbnail: alsThumbnail(thumbAnhang) }),
    });
  } catch (ursache) {
    return fehler(`Die Datei liess sich nicht schreiben: ${(ursache as Error).message}`);
  }

  const dateiname = sauberName(eingabe.dateiname, eingabe.format);
  const info = ausgabe(umgebung.env).ablegen({
    bytes: datei.bytes,
    dateiname,
    contentType: datei.contentType,
    eigentuemer: umgebung.benutzer,
  });

  const bilanz = bilanziere(gelesen.model, gelesen.environment, new Set(anhangsMap.keys()));

  /*
   * Die Datei entsteht **auch mit Verstoessen**, sie werden nur deutlich mitgeliefert.
   * Ein Zwischenstand ist oft genau das, was gewuenscht ist, und ein stummes Verweigern
   * waere hier der schlechtere Weg: das Modell haette nichts in der Hand und wuesste
   * nicht, wie nah es war.
   */
  const stunden = ausgabe(umgebung.env).lebensdauerMs / 3600000;
  return gib({
    url: `${umgebung.basisUrl}/api/mcp/dateien/${info.token}`,
    dateiname,
    format: eingabe.format,
    groesse: info.groesse,
    gueltigBis: new Date(info.erstellt + ausgabe(umgebung.env).lebensdauerMs).toISOString(),
    ...befundeAusgabe(gelesen.befunde),
    anhaenge: {
      geschrieben: [...anhangsMap.keys()],
      thumbnail: thumbAnhang === undefined ? null : alsThumbnail(thumbAnhang).path,
      fehlend: bilanz.fehlend,
      extern: bilanz.extern,
      unreferenziert: bilanz.unreferenziert,
    },
    hinweis:
      (gelesen.befunde.length === 0 ? "" : "Die Datei wurde trotz Befunden erzeugt. ") +
      `Der Link gilt ${stunden} Stunden.`,
  });
}

// --- anhang_hochladen -----------------------------------------------------------------

/**
 * Ein Anhang in die Ablage, ueber das Werkzeug statt ueber HTTP.
 *
 * `POST /api/mcp/anhaenge` bleibt fuer Shell und curl, ist aber aus einer Sandbox nicht
 * erreichbar, wenn die Domain nicht in deren Erlaubnisliste steht. Genau daran ist am
 * 10.08.2026 ein Produktfoto gescheitert: es wurde von 965 KB auf 11 KB heruntergerechnet,
 * damit es als base64 direkt in den Container passte, und die Bildqualitaet im AASX war
 * danach eine Folge des Transportwegs.
 *
 * Der Gewinn ist nicht, dass weniger durch den Kontext geht: die Bytes gehen genau einmal
 * durch, ueberstehen dann aber jeden weiteren Versuch, ohne noch einmal geschickt zu
 * werden.
 */
export interface HochladeEingabe {
  readonly base64: string;
  readonly dateiname?: string | null;
  readonly contentType?: string | null;
  readonly groesse?: number | null;
  readonly sha256?: string | null;
  /** Ohne: ein neuer Upload. Mit: an einen laufenden anhaengen. */
  readonly token?: string | null;
  /** 1-basierte Folgenummer. Ohne Angabe ein einteiliger Upload. */
  readonly teil?: number | null;
  /** Schliesst den stueckweisen Upload ab. */
  readonly letzter?: boolean | null;
}

export function anhangHochladen(umgebung: Umgebung, eingabe: HochladeEingabe): Ergebnis {
  const ablage = anhangsAblage(umgebung.env);
  const fortsetzung = (eingabe.token ?? "").trim();
  const teil = eingabe.teil ?? null;
  const stueckweise = fortsetzung !== "" || teil !== null;

  // Die Bytes dieses Aufrufs. Streng gelesen, aber noch ohne Signaturpruefung: bei einem
  // Teilstueck steht der Kopf nur im ersten und der Fuss nur im letzten.
  const gelesen = ausBase64(eingabe.base64);
  if (istBytesFehler(gelesen)) return fehler(gelesen.grund, gelesen.hinweis);
  if (gelesen.byteLength > MAX_BASE64_BYTES) {
    return fehler(
      `Ueber base64 sind je Aufruf hoechstens ${MAX_BASE64_BYTES / 1024 / 1024} MB vorgesehen, ` +
        `geschickt wurden ${Math.round(gelesen.byteLength / 1024)} KB.`,
      "Groesseres ueber die url-Quelle an aas_datei_erzeugen geben, dann holt der Server " +
        "die Datei selbst, ueber POST /api/mcp/anhaenge hochladen, oder hier stueckweise " +
        "mit teil und einem abschliessenden letzter=true samt sha256.",
    );
  }

  if (!stueckweise) return einteilig(ablage, umgebung.benutzer, eingabe, gelesen);
  return stueckweiser(ablage, umgebung.benutzer, eingabe, gelesen, fortsetzung, teil ?? 1);
}

function einteilig(
  ablage: Ablage,
  eigentuemer: string,
  eingabe: HochladeEingabe,
  bytes: Uint8Array,
): Ergebnis {
  const dateiname = (eingabe.dateiname ?? "").trim() || "anhang";
  const geprueft = pruefeTyp(eingabe.contentType ?? "", dateiname);
  if (istErgebnis(geprueft)) return geprueft;

  const zusage = pruefeZusage(bytes, eingabe, dateiname);
  if (zusage !== null) return fehler(zusage.grund, zusage.hinweis);
  const signatur = pruefeSignatur(bytes, geprueft, dateiname);
  if (signatur !== null) return fehler(signatur.grund, signatur.hinweis);

  const info = ablage.ablegen({ bytes, dateiname, contentType: geprueft, eigentuemer });

  return gib({
    token: info.token,
    dateiname: info.dateiname,
    contentType: info.contentType,
    groesse: info.groesse,
    // Immer mitgeliefert, auch ohne Zusage: damit ein Abgleich moeglich ist, ohne ihn
    // vorher angekuendigt zu haben.
    sha256: sha256Von(bytes),
    gueltigBis: new Date(info.erstellt + ablage.lebensdauerMs).toISOString(),
    hinweis:
      "Den Token als anhaenge[].token an aas_datei_erzeugen geben, zusammen mit dem " +
      "gewuenschten Paketpfad. Er ueberlebt dabei jeden weiteren Versuch.",
  });
}

/**
 * Ein Upload ueber mehrere Aufrufe.
 *
 * Der Sinn ist nicht Bequemlichkeit, sondern Nachweisbarkeit: bei einer Datei, die in einem
 * Stueck nicht durch den Gespraechsspeicher passt, war die Alternative bisher, sie
 * herunterzurechnen. Was ankam, war dann kleiner als die Quelle, und niemand konnte sagen,
 * ob das Absicht war oder ein Abriss.
 *
 * Geprueft wird deshalb erst am Schluss, dort aber vollstaendig: Kopf, Fuss und die
 * zugesagte Pruefsumme ueber alle Teile. Faellt eine durch, wird der ganze Token verworfen.
 * Ein halber Upload, der liegen bleibt, ist die Falle, die dieses Werkzeug schliessen soll.
 */
function stueckweiser(
  ablage: Ablage,
  eigentuemer: string,
  eingabe: HochladeEingabe,
  bytes: Uint8Array,
  fortsetzung: string,
  teil: number,
): Ergebnis {
  const letzter = eingabe.letzter === true;

  if (!Number.isInteger(teil) || teil < 1) {
    return fehler(`teil ist ${String(eingabe.teil)}, erwartet wird eine ganze Zahl ab 1.`);
  }

  if (fortsetzung === "") {
    if (teil !== 1) {
      return fehler(
        `Ohne token faengt ein Upload an, also mit teil=1; angegeben war teil=${teil}.`,
      );
    }
    const dateiname = (eingabe.dateiname ?? "").trim() || "anhang";
    const geprueft = pruefeTyp(eingabe.contentType ?? "", dateiname);
    if (istErgebnis(geprueft)) return geprueft;

    // Ein einziger Teil mit letzter=true ist derselbe Fall wie ein einteiliger Upload.
    if (letzter) return einteilig(ablage, eigentuemer, eingabe, bytes);

    const info = ablage.ablegen({
      bytes,
      dateiname,
      contentType: geprueft,
      eigentuemer,
      unvollstaendig: true,
      teil: 1,
    });
    return gib({
      token: info.token,
      teil: 1,
      angekommen: bytes.byteLength,
      vollstaendig: false,
      hinweis:
        "Den naechsten Teil mit diesem token und teil=2 schicken. Den letzten mit " +
        "letzter=true und sha256 ueber die **ganze** Datei.",
    });
  }

  const vorher = ablage.abrufen(fortsetzung, eigentuemer);
  if (vorher === null) {
    return fehler(
      "Der token ist unbekannt oder abgelaufen.",
      `Uploads sind ${ablage.lebensdauerMs / 3600000} Stunden gueltig. Neu anfangen, ohne token.`,
    );
  }
  if (vorher.info.unvollstaendig !== true) {
    return fehler(
      "Dieser Upload ist bereits abgeschlossen und nimmt keine weiteren Teile an.",
      "Ohne token einen neuen anfangen.",
    );
  }

  const erwartet = (vorher.info.teil ?? 0) + 1;
  if (teil !== erwartet) {
    // Der Entwurf bleibt unveraendert. Ein halb angewandter Stapel ist schlimmer als ein
    // abgelehnter, und fuer Bytes gilt das genauso wie fuer Patches.
    return fehler(
      `Erwartet wird teil=${erwartet}, angegeben war teil=${teil}.`,
      `Angekommen sind bisher ${vorher.bytes.byteLength} Bytes ueber ${vorher.info.teil ?? 0} Teile. ` +
        "Der Upload ist unveraendert geblieben.",
    );
  }

  const zusammen = new Uint8Array(vorher.bytes.byteLength + bytes.byteLength);
  zusammen.set(new Uint8Array(vorher.bytes), 0);
  zusammen.set(bytes, vorher.bytes.byteLength);

  if (zusammen.byteLength > MAX_ANHANG_BYTES) {
    ablage.verwerfen(fortsetzung, eigentuemer);
    return fehler(
      `Die Teile zusammen sind groesser als ${MAX_ANHANG_BYTES / 1024 / 1024} MB. ` +
        "Der Upload wurde verworfen.",
    );
  }

  if (!letzter) {
    const info = ablage.aktualisieren(fortsetzung, eigentuemer, zusammen, {
      unvollstaendig: true,
      teil,
    });
    if (info === null) return fehler("Der token ist zwischenzeitlich abgelaufen.");
    return gib({
      token: fortsetzung,
      teil,
      angekommen: zusammen.byteLength,
      vollstaendig: false,
      hinweis: `Weiter mit teil=${teil + 1}. Den letzten mit letzter=true und sha256.`,
    });
  }

  const dateiname = vorher.info.dateiname;
  const zusage = pruefeZusage(zusammen, eingabe, dateiname);
  if (zusage !== null) {
    ablage.verwerfen(fortsetzung, eigentuemer);
    return fehler(zusage.grund, `${zusage.hinweis ?? ""} Der Upload wurde verworfen.`.trim());
  }
  const signatur = pruefeSignatur(zusammen, vorher.info.contentType, dateiname);
  if (signatur !== null) {
    ablage.verwerfen(fortsetzung, eigentuemer);
    return fehler(signatur.grund, `${signatur.hinweis ?? ""} Der Upload wurde verworfen.`.trim());
  }

  const info = ablage.aktualisieren(fortsetzung, eigentuemer, zusammen, {
    unvollstaendig: false,
    teil,
  });
  if (info === null) return fehler("Der token ist zwischenzeitlich abgelaufen.");

  return gib({
    token: fortsetzung,
    dateiname: info.dateiname,
    contentType: info.contentType,
    groesse: info.groesse,
    teile: teil,
    sha256: sha256Von(zusammen),
    vollstaendig: true,
    gueltigBis: new Date(info.erstellt + ablage.lebensdauerMs).toISOString(),
    hinweis:
      "Den Token als anhaenge[].token an aas_datei_erzeugen geben, zusammen mit dem " +
      "gewuenschten Paketpfad.",
  });
}

// --- aas_datei_lesen ------------------------------------------------------------------

export async function aasDateiLesen(
  umgebung: Umgebung,
  eingabe: { url?: string | null; inhalt?: string | null; dateiname?: string | null },
): Promise<Ergebnis> {
  const url = eingabe.url?.trim() ?? "";
  const inhalt = eingabe.inhalt ?? "";

  if (url === "" && inhalt === "") {
    return fehler("Es fehlt die Quelle.", "Entweder url oder inhalt angeben.");
  }
  if (url !== "" && inhalt !== "") {
    return fehler("url und inhalt schliessen sich aus.", "Genau eine der beiden angeben.");
  }

  let bytes: Uint8Array;
  let name = eingabe.dateiname?.trim() ?? "";

  if (url !== "") {
    try {
      const geholt = await holeSicher(url, MAX_ANHANG_BYTES, {
        erlaubt: umgebung.env.mcpNetzErlaubt,
      });
      bytes = geholt.bytes;
      if (name === "") name = geholt.url.pathname.split("/").pop() ?? "";
    } catch (ursache) {
      if (ursache instanceof NetzFehler) return fehler(ursache.message);
      throw ursache;
    }
  } else {
    if (inhalt.length > MAX_EINGABE) {
      return fehler(`Der Inhalt ist groesser als ${MAX_EINGABE / 1024 / 1024} MB.`);
    }
    bytes = new TextEncoder().encode(inhalt);
  }

  try {
    const gelesen = await importFile(bytes, name === "" ? undefined : name);

    /*
     * Die Anhaenge wandern in die Ablage, statt nur benannt zu werden. Ohne das war
     * "nimm diese AAS als Vorlage" ein Verlustgeschaeft: das Modell kam zurueck, die
     * Dateien blieben liegen, und der naechste Export schrieb tote Pfade.
     */
    const ablage = anhangsAblage(umgebung.env);
    const teile = [...gelesen.attachments.values()];
    if (gelesen.thumbnail !== null) teile.push(gelesen.thumbnail);

    /*
     * Dieselben Grenzen wie der Schreibpfad, und aus demselben Grund: eine fremde AASX ueber
     * `url` ist unangemeldet erreichbar, und ohne diese Deckelung legt eine Zip-Bombe jeden
     * ihrer Eintraege einzeln auf das Volume (Sicherheitsaudit 11.08.2026, mittlerer Befund).
     */
    if (teile.length > MAX_ANHAENGE) {
      return fehler(
        `Die Datei traegt ${teile.length} Anhaenge, mehr als ${MAX_ANHAENGE} werden nicht abgelegt.`,
      );
    }
    const summe = teile.reduce((s, teil) => s + teil.bytes.byteLength, 0);
    if (summe > MAX_CONTAINER_BYTES) {
      return fehler(
        `Die Anhaenge zusammen sind ${Math.round(summe / 1024 / 1024)} MB, erlaubt sind ${MAX_CONTAINER_BYTES / 1024 / 1024} MB.`,
      );
    }

    const abgelegt = teile.map((teil) => {
      const info = ablage.ablegen({
        bytes: teil.bytes,
        dateiname: teil.path.split("/").pop() ?? "anhang",
        contentType: teil.contentType,
        eigentuemer: umgebung.benutzer,
      });
      return {
        pfad: teil.path,
        contentType: teil.contentType,
        groesse: info.groesse,
        token: info.token,
      };
    });

    /*
     * Der Entwurf entsteht gleich mit. Das Environment steht hier ohnehin fertig auf dem
     * Server, und es herauszugeben, damit der Aufrufer es beim naechsten Aufruf
     * zurueckbringt, ist die teuerste Art, nichts zu gewinnen.
     */
    const environment = denormalize(gelesen.model);
    const entwurf = entwurfSchreiben(umgebung, environment);
    const stunden = anhangsAblage(umgebung.env).lebensdauerMs / 3600000;

    return gib({
      format: gelesen.format,
      quellfassung: gelesen.sourceVersion,
      entwurf,
      anhaenge: abgelegt,
      aufstieg: gelesen.upgradeNotes,
      environment,
      hinweis:
        "environment ist Metamodell 3.1. Fuer alles Weitere genuegt entwurf: " +
        "entwurf_aendern fuer Korrekturen, aas_datei_erzeugen fuer die Datei. Das " +
        `Environment muss nicht zurueckgeschickt werden. Die Anhaenge liegen ${stunden} ` +
        "Stunden bereit; ihr token taugt unveraendert als Quelle in aas_datei_erzeugen.",
    });
  } catch (ursache) {
    return fehler(`Die Datei liess sich nicht lesen: ${(ursache as Error).message}`);
  }
}
