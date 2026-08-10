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
import { anhaenge as anhangsAblage, ausgabe, LEBENSDAUER_MS } from "../services/ablage.js";
import { holeSicher, NetzFehler } from "./netz.js";
import { KATALOG, KENNUNGEN, pflichtGeruest, semantikVon, vorlageVon } from "./vorlagen.js";

/**
 * Die Werkzeuge des MCP-Servers.
 *
 * Bewusst ohne Fastify- und ohne MCP-Typen: hier stehen reine Funktionen ueber
 * `@aas-editor/core`, `mcp/server.ts` haengt nur die Schemata davor. Das ist die Naht,
 * an der eine spaetere Absicherung einen Benutzer durchreichen kann, ohne dass ein
 * Werkzeug davon wissen muss.
 *
 * **Zustandslos.** Kein Werkzeug sieht die Datenbank, keines kennt ein Projekt. Der
 * Zwischenstand einer entstehenden AAS lebt im Gespraech, nicht auf dem Server; nur
 * Dateien liegen kurz in der Ablage, in beide Richtungen (`services/ablage.ts`).
 */

export interface Umgebung {
  readonly env: ServerEnv;
  /** Wurzel fuer Download-Links, aus der Anfrage abgeleitet, ohne abschliessenden Schraegstrich. */
  readonly basisUrl: string;
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

export function aasVorlage(eingabe: {
  kennung?: string | null;
  umfang?: "pflicht" | "vollstaendig" | null;
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
        "Mit kennung aufrufen, um das Geruest zu bekommen. Die semanticId-Werte stammen " +
        "unveraendert aus den offiziellen Vorlagen des Herausgebers und duerfen nicht " +
        "abgewandelt werden.",
    });
  }

  const eintrag = vorlageVon(kennung);
  if (eintrag === undefined) {
    return fehler(`Unbekannte Vorlage "${kennung}".`, `Erlaubt sind: ${KENNUNGEN.join(", ")}.`);
  }

  if (eingabe.umfang === "vollstaendig") {
    return gib({
      kennung: eintrag.kennung,
      titel: eintrag.titel,
      idta: eintrag.idta,
      umfang: "vollstaendig",
      environment: eintrag.quelle,
      hinweis:
        "Die vollstaendige Vorlage samt conceptDescriptions, unveraendert. kind steht auf " +
        "Template; fuer eine echte AAS auf Instance setzen und eine eigene id vergeben.",
    });
  }

  const geruest = pflichtGeruest(eintrag);
  return gib({
    kennung: eintrag.kennung,
    titel: eintrag.titel,
    idta: eintrag.idta,
    umfang: "pflicht",
    submodel: geruest.submodel,
    weggelassen: geruest.weggelassen,
    ohneKardinalitaet: geruest.ohneKardinalitaet,
    hinweis:
      "Nur Elemente mit SMT/Cardinality One oder OneToMany, Beispielwerte entfernt. " +
      "Wo TODO steht, verlangt das Metamodell einen nicht leeren Wert; das ist zu " +
      "ersetzen, nicht zu loeschen. " +
      "Das Feld _kardinalitaet ist eine Auskunft und gehoert vor dem Export entfernt. " +
      "Die id ist die der Vorlage und muss durch eine eigene ersetzt werden. " +
      "umfang=vollstaendig liefert alle Elemente samt conceptDescriptions.",
  });
}

// --- Anhaenge -------------------------------------------------------------------------

export interface AnhangsEingabe {
  readonly pfad: string;
  readonly contentType?: string | null;
  readonly url?: string | null;
  readonly base64?: string | null;
  readonly token?: string | null;
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
        const geholt = await holeSicher(eintrag.url.trim(), MAX_ANHANG_BYTES);
        bytes = geholt.bytes;
        if (typ === "") typ = geholt.contentType;
      } catch (ursache) {
        if (ursache instanceof NetzFehler) return fehler(`"${pfad}": ${ursache.message}`);
        throw ursache;
      }
    } else if (typeof eintrag.base64 === "string" && eintrag.base64.trim() !== "") {
      const roh = eintrag.base64.replace(/^data:[^,]*,/, "").trim();
      const puffer = Buffer.from(roh, "base64");
      if (puffer.byteLength === 0) {
        return fehler(`"${pfad}": base64 liess sich nicht lesen oder ist leer.`);
      }
      if (puffer.byteLength > MAX_BASE64_BYTES) {
        return fehler(
          `"${pfad}": ueber base64 sind hoechstens ${MAX_BASE64_BYTES / 1024 / 1024} MB vorgesehen.`,
          "Groesseres ueber POST /api/mcp/anhaenge hochladen und den Token angeben.",
        );
      }
      bytes = new Uint8Array(puffer);
    } else {
      const token = String(eintrag.token).trim();
      const abruf = ablage.abrufen(token);
      if (abruf === null) {
        return fehler(
          `"${pfad}": der Token ist unbekannt oder abgelaufen.`,
          `Hochgeladene Anhaenge sind ${LEBENSDAUER_MS / 60000} Minuten gueltig.`,
        );
      }
      bytes = new Uint8Array(abruf.bytes);
      if (typ === "") typ = abruf.info.contentType;
    }

    const geprueft = pruefeTyp(typ, pfad);
    if (istErgebnis(geprueft)) return geprueft;

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

function alsBefund(issue: ValidationIssue): Befund {
  return {
    schwere: issue.severity === "constraint" ? "verstoss" : "warnung",
    regel: issue.constraintId,
    pfad: issue.aasPath,
    ...(issue.field === "" ? {} : { feld: issue.field }),
    text: alsText(issue),
  };
}

/**
 * JSON einlesen, normalisieren, pruefen. Der Weg, den `aas_pruefen` und
 * `aas_datei_erzeugen` beide gehen.
 *
 * @param pfade Die vorhandenen Paketpfade. Ohne sie meldet die Pruefung jedes
 * File-Element als fehlenden Anhang, und genau das war der Grund, warum die Warnung
 * bisher nichts wert war.
 */
async function lies(roh: string, pfade: Set<string>): Promise<Gelesen | Ergebnis> {
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
  const environment = json as JsonObject;

  let model: ReturnType<typeof normalize>;
  try {
    model = normalize(environment);
  } catch (ursache) {
    return fehler(`Das Environment liess sich nicht lesen: ${(ursache as Error).message}`);
  }

  try {
    const issues = await validate(model, pfade);
    return { model, environment, befunde: issues.map(alsBefund), schreibbar: true };
  } catch (ursache) {
    /*
     * Ein fehlendes Pflichtfeld ist kein Werkzeugfehler, es ist der haeufigste Befund
     * ueberhaupt und muss als solcher herauskommen. Die SDK kann das Modell dann zwar
     * nicht aufbauen und die Pruefung faellt aus, aber die Meldung nennt Grund und
     * Pfad, und genau damit repariert das Modell seinen Entwurf.
     */
    if (istKernFehler(ursache) && ursache.schluessel === "modell.nichtZurueckwandelbar") {
      return {
        model,
        environment,
        schreibbar: false,
        befunde: [
          {
            schwere: "verstoss",
            regel: null,
            pfad: String(ursache.werte["pfad"] ?? ""),
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
  readonly aufgeloest: string[];
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
  const aufgeloest: string[] = [];
  const fehlend: { pfad: string; aasPath: string }[] = [];
  const extern: { url: string; aasPath: string }[] = [];
  const benutzt = new Set<string>();

  for (const verweis of dateiverweise(model)) {
    if (IST_EXTERN.test(verweis.wert)) {
      extern.push({ url: verweis.wert, aasPath: verweis.aasPath });
      continue;
    }
    const pfad = normalizePath(verweis.wert);
    if (pfade.has(pfad)) {
      aufgeloest.push(pfad);
      benutzt.add(pfad);
    } else {
      fehlend.push({ pfad, aasPath: verweis.aasPath });
    }
  }

  const thumb = thumbnailPfad(environment);
  if (thumb !== null && pfade.has(thumb)) benutzt.add(thumb);

  return {
    aufgeloest,
    fehlend,
    extern,
    unreferenziert: [...pfade].filter((pfad) => !benutzt.has(pfad)),
  };
}

// --- aas_pruefen ----------------------------------------------------------------------

export async function aasPruefen(eingabe: {
  environment: string;
  anhaenge?: readonly string[] | null;
}): Promise<Ergebnis> {
  const pfade = new Set((eingabe.anhaenge ?? []).map((p) => normalizePath(String(p).trim())));
  const gelesen = await lies(eingabe.environment, pfade);
  if (istErgebnis(gelesen)) return gelesen;

  const bilanz = bilanziere(gelesen.model, gelesen.environment, pfade);

  return gib({
    ...befundeAusgabe(gelesen.befunde),
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
  });
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
    environment: string;
    format: AasFormat;
    dateiname?: string | null;
    anhaenge?: readonly AnhangsEingabe[] | null;
  },
): Promise<Ergebnis> {
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

  const gelesen = await lies(eingabe.environment, new Set(anhangsMap.keys()));
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
  });

  const bilanz = bilanziere(gelesen.model, gelesen.environment, new Set(anhangsMap.keys()));

  /*
   * Die Datei entsteht **auch mit Verstoessen**, sie werden nur deutlich mitgeliefert.
   * Ein Zwischenstand ist oft genau das, was gewuenscht ist, und ein stummes Verweigern
   * waere hier der schlechtere Weg: das Modell haette nichts in der Hand und wuesste
   * nicht, wie nah es war.
   */
  return gib({
    url: `${umgebung.basisUrl}/api/mcp/dateien/${info.token}`,
    dateiname,
    format: eingabe.format,
    groesse: info.groesse,
    gueltigBis: new Date(info.erstellt + LEBENSDAUER_MS).toISOString(),
    ...befundeAusgabe(gelesen.befunde),
    anhaenge: {
      geschrieben: [...anhangsMap.keys()],
      thumbnail: thumbAnhang === undefined ? null : alsThumbnail(thumbAnhang).path,
      fehlend: bilanz.fehlend,
      extern: bilanz.extern,
      unreferenziert: bilanz.unreferenziert,
    },
    hinweis:
      gelesen.befunde.length === 0
        ? "Der Link ist eine Stunde lang gueltig."
        : "Die Datei wurde trotz Befunden erzeugt. Der Link ist eine Stunde lang gueltig.",
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
      const geholt = await holeSicher(url, MAX_ANHANG_BYTES);
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

    const abgelegt = teile.map((teil) => {
      const info = ablage.ablegen({
        bytes: teil.bytes,
        dateiname: teil.path.split("/").pop() ?? "anhang",
        contentType: teil.contentType,
      });
      return {
        pfad: teil.path,
        contentType: teil.contentType,
        groesse: info.groesse,
        token: info.token,
      };
    });

    return gib({
      format: gelesen.format,
      quellfassung: gelesen.sourceVersion,
      anhaenge: abgelegt,
      aufstieg: gelesen.upgradeNotes,
      environment: denormalize(gelesen.model),
      hinweis:
        "environment ist Metamodell 3.1 und kann unveraendert an aas_pruefen und " +
        "aas_datei_erzeugen weitergereicht werden. Die Anhaenge liegen eine Stunde " +
        "bereit; ihr token taugt unveraendert als Quelle in aas_datei_erzeugen.",
    });
  } catch (ursache) {
    return fehler(`Die Datei liess sich nicht lesen: ${(ursache as Error).message}`);
  }
}
