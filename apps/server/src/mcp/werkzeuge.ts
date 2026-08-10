import {
  IDENTIFIABLE_KINDS,
  SUBMODEL_ELEMENT_KINDS,
  childSlotsOf,
  denormalize,
  ENUMS,
  fieldsOf,
  newNodeData,
  normalize,
  istKernFehler,
  specOf,
  type ElementSpec,
  type EnumName,
  type JsonObject,
} from "@aas-editor/core";
import { exportFile, importFile, type AasFormat } from "@aas-editor/core/io";
import { validate, type ValidationIssue } from "@aas-editor/core/validation";
import { ablegen, LEBENSDAUER_MS, type AblageInfo } from "../services/ausgabe.js";
import type { ServerEnv } from "../env.js";

/**
 * Die Werkzeuge des MCP-Servers.
 *
 * Bewusst ohne Fastify- und ohne MCP-Typen: hier stehen reine Funktionen ueber
 * `@aas-editor/core`, `mcp/server.ts` haengt nur die Schemata davor. Das ist die Naht,
 * an der eine spaetere Absicherung einen Benutzer durchreichen kann, ohne dass ein
 * Werkzeug davon wissen muss.
 *
 * **Zustandslos.** Kein Werkzeug sieht die Datenbank, keines kennt ein Projekt. Der
 * Zwischenstand einer entstehenden AAS lebt im Gespraech, nicht auf dem Server; einzig
 * die fertige Datei wird kurz abgelegt, damit der Chat einen Link bekommt.
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

/** Mehr als das nimmt kein Werkzeug entgegen. */
const MAX_EINGABE = 8 * 1024 * 1024;
/** Mehr Befunde als das liest ohnehin niemand, und die Antwort soll lesbar bleiben. */
const MAX_BEFUNDE = 100;
/** Obergrenze fuer eine Datei, die `aas_datei_lesen` von einer fremden Adresse holt. */
const MAX_ABRUF = 32 * 1024 * 1024;

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
  return vorlage ?? (befund.schluessel ?? "Warnung ohne Text.");
}

/**
 * JSON einlesen, normalisieren, pruefen. Der Weg, den `aas_pruefen` und
 * `aas_datei_erzeugen` beide gehen.
 *
 * Bei kaputter Eingabe steht hier ein `Ergebnis` statt eines `Gelesen`; der Aufrufer
 * reicht es unveraendert durch.
 */
async function lies(roh: string): Promise<Gelesen | Ergebnis> {
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

  let model: ReturnType<typeof normalize>;
  try {
    model = normalize(json as JsonObject);
  } catch (ursache) {
    return fehler(`Das Environment liess sich nicht lesen: ${(ursache as Error).message}`);
  }

  try {
    return { model, befunde: (await validate(model)).map(alsBefund), schreibbar: true };
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

function alsBefund(issue: ValidationIssue): Befund {
  return {
    schwere: issue.severity === "constraint" ? "verstoss" : "warnung",
    regel: issue.constraintId,
    pfad: issue.aasPath,
    ...(issue.field === "" ? {} : { feld: issue.field }),
    text: alsText(issue),
  };
}

function istErgebnis(wert: Gelesen | Ergebnis): wert is Ergebnis {
  return "text" in wert;
}

function befundeAusgabe(befunde: readonly Befund[]): Record<string, unknown> {
  return {
    verstoesse: befunde.filter((b) => b.schwere === "verstoss").length,
    warnungen: befunde.filter((b) => b.schwere === "warnung").length,
    befunde: befunde.slice(0, MAX_BEFUNDE),
    ...(befunde.length > MAX_BEFUNDE ? { abgeschnitten: befunde.length - MAX_BEFUNDE } : {}),
  };
}

// --- aas_pruefen ----------------------------------------------------------------------

export async function aasPruefen(eingabe: { environment: string }): Promise<Ergebnis> {
  const gelesen = await lies(eingabe.environment);
  if (istErgebnis(gelesen)) return gelesen;

  return gib({
    ...befundeAusgabe(gelesen.befunde),
    urteil: urteilVon(gelesen),
  });
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
  eingabe: { environment: string; format: AasFormat; dateiname?: string | null },
): Promise<Ergebnis> {
  const gelesen = await lies(eingabe.environment);
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

  let datei: Awaited<ReturnType<typeof exportFile>>;
  try {
    datei = await exportFile({ model: gelesen.model, format: eingabe.format });
  } catch (ursache) {
    return fehler(`Die Datei liess sich nicht schreiben: ${(ursache as Error).message}`);
  }

  const dateiname = sauberName(eingabe.dateiname, eingabe.format);
  const info: AblageInfo = ablegen(umgebung.env, {
    bytes: datei.bytes,
    dateiname,
    contentType: datei.contentType,
  });

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
    hinweis:
      gelesen.befunde.length === 0
        ? "Der Link ist eine Stunde lang gueltig."
        : "Die Datei wurde trotz Befunden erzeugt. Der Link ist eine Stunde lang gueltig.",
  });
}

// --- aas_datei_lesen ------------------------------------------------------------------

export async function aasDateiLesen(eingabe: {
  url?: string | null;
  inhalt?: string | null;
  dateiname?: string | null;
}): Promise<Ergebnis> {
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
    let ziel: URL;
    try {
      ziel = new URL(url);
    } catch {
      return fehler(`"${url}" ist keine gueltige Adresse.`);
    }
    // Nur https. Alles andere (file:, http: ins interne Netz) machte aus diesem Werkzeug
    // ein Leseloch in alles, was der Server erreichen kann.
    if (ziel.protocol !== "https:") {
      return fehler("Nur https-Adressen werden gelesen.", `Gelesen wurde "${ziel.protocol}".`);
    }

    try {
      const antwort = await fetch(ziel, { redirect: "follow" });
      if (!antwort.ok) {
        return fehler(`Die Adresse antwortete mit ${antwort.status}.`);
      }
      const puffer = await antwort.arrayBuffer();
      if (puffer.byteLength > MAX_ABRUF) {
        return fehler(`Die Datei ist groesser als ${MAX_ABRUF / 1024 / 1024} MB.`);
      }
      bytes = new Uint8Array(puffer);
    } catch (ursache) {
      return fehler(`Die Adresse liess sich nicht abrufen: ${(ursache as Error).message}`);
    }

    if (name === "") name = ziel.pathname.split("/").pop() ?? "";
  } else {
    if (inhalt.length > MAX_EINGABE) {
      return fehler(`Der Inhalt ist groesser als ${MAX_EINGABE / 1024 / 1024} MB.`);
    }
    bytes = new TextEncoder().encode(inhalt);
  }

  try {
    const gelesen = await importFile(bytes, name === "" ? undefined : name);
    return gib({
      format: gelesen.format,
      quellfassung: gelesen.sourceVersion,
      anhaenge: [...gelesen.attachments.keys()],
      aufstieg: gelesen.upgradeNotes,
      environment: denormalize(gelesen.model),
      hinweis:
        "environment ist Metamodell 3.1 und kann unveraendert an aas_pruefen und " +
        "aas_datei_erzeugen weitergereicht werden. Anhaenge sind nur benannt, ihre Bytes " +
        "gehen bei einem erneuten Export verloren.",
    });
  } catch (ursache) {
    return fehler(`Die Datei liess sich nicht lesen: ${(ursache as Error).message}`);
  }
}
