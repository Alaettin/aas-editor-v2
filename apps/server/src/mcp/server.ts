import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import { KENNUNGEN } from "./vorlagen.js";
import {
  aasDateiErzeugen,
  aasDateiLesen,
  aasPruefen,
  aasSchema,
  aasVorlage,
  ALLE_ARTEN,
  anhangHochladen,
  entwurfAendern,
  entwurfAnlegen,
  entwurfAnsehen,
  ERLAUBTE_TYPEN,
  teilmodellErzeugen,
  type Ergebnis,
  type Umgebung,
} from "./werkzeuge.js";

/**
 * Der MCP-Server des AXON Editors.
 *
 * Er ist eine **Werkbank, kein Fernzugriff**: er kennt weder Projekte noch Benutzer noch
 * die Datenbank. Was er kann, kann ein Sprachmodell allein nicht, naemlich das
 * AAS-Metamodell verlaesslich treffen und die IRDIs der IDTA-Vorlagen richtig setzen.
 * Die Pruefung kommt aus `verification.verify()` der offiziellen SDK, die Formatschreiber
 * sind dieselben wie im Editor, die Vorlagen sind die des Herausgebers.
 *
 * Je Anfrage entsteht eine frische Instanz, siehe `routes/mcp.ts`. Es gibt deshalb
 * nichts, was zwischen zwei Aufrufen stehen bleiben koennte.
 */

/**
 * Die Werkzeugbeschreibungen sind hier kein Beiwerk.
 *
 * Sie sind die **einzige** Anleitung, die das Modell bekommt: es gibt keine Oberflaeche,
 * die einen Ablauf vorgibt, und keinen Systemtext, den wir setzen koennten. Steht die
 * Reihenfolge nicht in der Beschreibung, raet das Modell die Feldnamen und liefert
 * ungeprueftes JSON aus.
 */
const REIHENFOLGE =
  "Ablauf fuer Teilmodelle nach IDTA: erst aas_vorlage mit umfang=struktur, das zeigt die " +
  "idShort-Pfade. Dann entwurf_anlegen mit kopf und teilmodelle, wobei je Teilmodell nur " +
  "die Werte aus dem Datenblatt stehen; Schale, semanticId, IRDIs, valueType und die " +
  "Verweise dazwischen setzt der Server aus der Vorlage. Weitere Teilmodelle danach mit " +
  "teilmodell_erzeugen und derselben Entwurfskennung, Korrekturen mit entwurf_aendern, " +
  "zuletzt aas_datei_erzeugen mit demselben entwurf. " +
  "**Metamodell-Geruest gehoert nicht in einen Aufruf**: semanticId-Bloecke abzutippen ist " +
  "der teuerste und fehleranfaelligste Teil, und der Server kennt sie bereits. Fuer alles " +
  "ausserhalb der IDTA-Vorlagen: aas_schema fuer die Feldnamen und entwurf_anlegen mit " +
  "environment, dieses dann aber nur **einmal**.";

/** Ein Anhang, so wie ihn `aas_datei_erzeugen` entgegennimmt. */
const ANHANG = z.object({
  pfad: z
    .string()
    .describe("Paketpfad im Container, absolut, etwa /aasx/files/datenblatt.pdf."),
  contentType: z
    .string()
    .nullish()
    .describe(`null uebernimmt den Typ der Quelle. Erlaubt: ${ERLAUBTE_TYPEN.join(", ")}.`),
  url: z
    .string()
    .nullish()
    .describe(
      "https-Adresse, von der der Server die Datei selbst holt. **Der beste Weg**: die " +
        "Bytes gehen gar nicht durch das Gespraech.",
    ),
  base64: z
    .string()
    .nullish()
    .describe(
      "Bytes als base64, bis 2 MB. Der letzte Weg: sie gehen bei jedem Versuch erneut " +
        "durch das Gespraech. Fuer mehr als einen Anlauf anhang_hochladen nehmen.",
    ),
  token: z
    .string()
    .nullish()
    .describe(
      "Token aus anhang_hochladen, aus POST /api/mcp/anhaenge oder aus aas_datei_lesen.",
    ),
  groesse: z
    .number()
    .nullish()
    .describe(
      "Zugesagte Groesse in Bytes. Weicht das Angekommene ab, wird abgelehnt statt " +
        "stillschweigend uebernommen.",
    ),
  sha256: z
    .string()
    .nullish()
    .describe("Zugesagte Pruefsumme, 64 Stellen hex. Weicht sie ab, wird abgelehnt."),
});

/**
 * Werte fuer ein Teilmodell: idShort-Pfad auf Wert.
 *
 * `z.json()` als Wert, weil die Schreibweise von der Art des Elements abhaengt und der
 * Server sie kennt: eine Zeichenkette fuer eine Property, `{"de": "..."}` fuer eine
 * MultiLanguageProperty, `{"min", "max"}` fuer ein Range, ein Paketpfad fuer eine File.
 * Der Aufrufer schreibt, was im Datenblatt steht; die Umsetzung ist Buchhaltung.
 */
const WERTE = z.record(z.string(), z.json());

/** Die Kopfdaten einer Schale. */
const KOPF = z.object({
  globalAssetId: z
    .string()
    .describe("Die Kennung des Assets, etwa eine IRI oder eine IEC-61406-Adresse. Pflicht."),
  assetKind: z.enum(["Instance", "Type"]).nullish().describe("Vorgabe Instance."),
  idShort: z.string().nullish().describe("Sprechender Name der Schale."),
  id: z.string().nullish().describe("Die id der Schale. Ohne Angabe eine abgeleitete."),
});

/** Ein Teilmodell, das aus einer Vorlage entstehen soll. */
const TEILMODELL = z.object({
  kennung: z.string().describe(`Die Vorlage. Erlaubt: ${KENNUNGEN.join(", ")}.`),
  id: z.string().nullish().describe("Die id des Teilmodells. Ohne Angabe eine abgeleitete."),
  idShort: z.string().nullish().describe("Ohne Angabe der idShort der Vorlage."),
  werte: WERTE.nullish().describe(
    "idShort-Pfad auf Wert. Die Pfade zeigt aas_vorlage mit umfang=struktur.",
  ),
});

/** Ein Patch auf einen Entwurf. */
const PATCH = z.object({
  op: z
    .enum(["setzen", "entfernen", "anfuegen"])
    .describe(
      "setzen schreibt oder ueberschreibt, entfernen loescht, anfuegen haengt in eine " +
        "Liste ein und verlangt dort einen Index oder \"-\" fuer ans Ende.",
    ),
  pfad: z
    .string()
    .describe(
      "JSON Pointer nach RFC 6901 in das Environment, etwa " +
        "/submodels/0/submodelElements/3/value. In der Nummerierung zaehlt die Liste, " +
        "nicht der idShort. Mit entwurf_lesen nachsehen, wenn der Index unklar ist.",
    ),
  // `z.json()` und nicht `z.unknown()`: der Wert landet in einem Environment, das als JSON
  // geschrieben wird, und alles, was sich dort nicht abbilden laesst, hat hier nichts
  // verloren. Nebenbei passt der Typ damit auf `JsonValue` des Kerns.
  wert: z
    .json()
    .optional()
    .describe("Der neue Wert, beliebiges JSON. Bei entfernen wegzulassen."),
});

export function baueMcpServer(umgebung: Umgebung): McpServer {
  const server = new McpServer(
    {
      name: "axon-editor",
      version: __APP_VERSION__,
    },
    {
      instructions:
        "Werkzeuge zum Bauen von Asset Administration Shells nach IDTA-Metamodell 3.1. " +
        REIHENFOLGE +
        " Wo doch ein Environment noetig ist, wird es als JSON-Text uebergeben und hat die " +
        'Form {"assetAdministrationShells": [...], "submodels": [...]}. ' +
        "Jedes Element traegt sein modelType. Einen Slot, der nichts enthaelt, ganz " +
        "weglassen: eine leere Liste ist laut Metamodell ein Verstoss, der Server " +
        "entfernt sie und sagt es dazu. " +
        "Anhaenge kommen am besten ueber url, dann holt der Server die Datei selbst; " +
        "base64 nur fuer Kleinkram, und dann mit sha256 oder groesse als Zusage: der " +
        "Server prueft Kopf und Fuss der Bytes und lehnt eine abgeschnittene Datei ab, " +
        "statt sie stillschweigend anzunehmen.",
    },
  );

  server.registerTool(
    "aas_schema",
    {
      title: "AAS-Schema",
      description:
        "Die Felder einer AAS-Art samt Pflichtangaben, erlaubten Aufzaehlungswerten, " +
        "Kindlisten und einem gueltigen Geruest. Ohne art kommt die Liste aller Arten. " +
        "Vor dem ersten Entwurf aufzurufen, damit keine Feldnamen geraten werden.",
      inputSchema: {
        art: z
          .string()
          .nullish()
          .describe(`Art, etwa Property oder Submodel. Erlaubt: ${ALLE_ARTEN.join(", ")}.`),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (eingabe) => alsInhalt(aasSchema(eingabe)),
  );

  server.registerTool(
    "aas_vorlage",
    {
      title: "IDTA-Teilmodellvorlage",
      description:
        "Das Geruest eines Teilmodells nach IDTA, mit den korrekten semanticId-Werten " +
        "und IRDIs aus der offiziellen Vorlage des Herausgebers. **Immer hier anfangen**, " +
        "wenn ein Nameplate, TechnicalData oder eine HandoverDocumentation entstehen soll: " +
        "IRDIs wie 0173-1#02-ABI504#001 lassen sich nicht aus dem Gedaechtnis richtig " +
        "erzeugen. Ohne kennung kommt die Liste der Vorlagen.",
      inputSchema: {
        kennung: z.string().nullish().describe(`Erlaubt: ${KENNUNGEN.join(", ")}.`),
        umfang: z
          .enum(["struktur", "pflicht", "vollstaendig"])
          .nullish()
          .describe(
            "struktur (Vorgabe) ist der Bauplan: alle Elemente, aber nur idShort, " +
              "modelType, semanticId, valueType und Kardinalitaet. pflicht liefert ein " +
              "einsetzbares Geruest der Pflichtelemente. vollstaendig gibt die Datei des " +
              "Herausgebers unveraendert heraus und ist ohne pfad sehr gross.",
          ),
        pfad: z
          .string()
          .nullish()
          .describe(
            "Auf einen Teilbaum eingrenzen, ueber die idShort-Kette, etwa \"/Markings\". " +
              "In einer SubmodelElementList zaehlt der Index: \"/Markings/0\".",
          ),
        conceptDescriptions: z
          .boolean()
          .nullish()
          .describe(
            "Nur bei vollstaendig. Die Begriffsdefinitionen machen den Loewenanteil der " +
              "Groesse aus und kommen deshalb nur auf Verlangen mit.",
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (eingabe) => alsInhalt(aasVorlage(eingabe)),
  );

  server.registerTool(
    "entwurf_anlegen",
    {
      title: "Entwurf anlegen",
      description:
        "Legt einen Entwurf an, prueft ihn und behaelt ihn. Zurueck kommt eine " +
        "Entwurfskennung, die alle weiteren Werkzeuge statt des Environments annehmen. " +
        "**Der beste Weg ist kopf + teilmodelle**: dann baut der Server Schale, " +
        "Teilmodelle und die Verweise dazwischen aus den IDTA-Vorlagen, und ueber die " +
        "Leitung gehen nur die Werte aus dem Datenblatt. semanticId, IRDI und valueType " +
        "kennt er bereits. environment bleibt fuer alles, was keiner Vorlage folgt. Genau " +
        "eines von beidem.",
      inputSchema: {
        environment: z
          .string()
          .nullish()
          .describe(
            "Das vollstaendige AAS Environment als JSON-Text, Metamodell 3.1. Nur noetig, " +
              "wenn nicht nach einer IDTA-Vorlage gebaut wird.",
          ),
        kopf: KOPF.nullish().describe("Die Kopfdaten der Schale. Mit teilmodelle zu nehmen."),
        teilmodelle: z
          .array(TEILMODELL)
          .nullish()
          .describe(
            "Welche Vorlagen als Teilmodelle entstehen sollen, je mit den Werten. Der " +
              "Server setzt semanticId, IRDIs, valueType und die Verweise von der Schale.",
          ),
        anhaenge: z
          .array(z.string())
          .nullish()
          .describe("Paketpfade vorhandener Anhaenge, damit File-Elemente als aufgeloest gelten."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (eingabe) => alsInhalt(await entwurfAnlegen(umgebung, eingabe)),
  );

  server.registerTool(
    "teilmodell_erzeugen",
    {
      title: "Teilmodell nach Vorlage erzeugen",
      description:
        "Baut ein Teilmodell aus einer IDTA-Vorlage und einer flachen Abbildung von " +
        "idShort-Pfad auf Wert. **Der Server kennt semanticId, IRDI, valueType und die " +
        "Listenstruktur bereits**; sie abzutippen ist unnoetig und genau die Stelle, an " +
        "der Fehler entstehen. Pflichtelemente kommen von selbst mit und stehen auf TODO, " +
        "bis sie belegt sind. Mit entwurf haengt der Server das Ergebnis direkt an und " +
        "setzt den Verweis von der Schale; dann geht gar kein Teilmodell-JSON durch das " +
        "Gespraech. Welche Pfade es gibt, zeigt aas_vorlage mit umfang=struktur.",
      inputSchema: {
        kennung: z.string().describe(`Die Vorlage. Erlaubt: ${KENNUNGEN.join(", ")}.`),
        werte: WERTE.nullish().describe(
          "idShort-Pfad auf Wert, etwa {\"/GeneralInformation/ManufacturerName\": " +
            "\"Endress+Hauser\"}. Ein Pfad, den die Vorlage nicht kennt, wird abgelehnt " +
            "und nennt die Geschwister an der Bruchstelle.",
        ),
        id: z.string().nullish().describe("Die id des Teilmodells. Ohne Angabe eine abgeleitete."),
        idShort: z.string().nullish().describe("Ohne Angabe der idShort der Vorlage."),
        entwurf: z
          .string()
          .nullish()
          .describe(
            "Kennung aus entwurf_anlegen. Mit ihr wird angehaengt statt zurueckgegeben, " +
              "und das ist der Weg, der Uebertragung spart.",
          ),
        anhaenge: z.array(z.string()).nullish().describe("Wie bei entwurf_anlegen."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (eingabe) => alsInhalt(await teilmodellErzeugen(umgebung, eingabe)),
  );

  server.registerTool(
    "entwurf_aendern",
    {
      title: "Entwurf aendern",
      description:
        "Aendert einen Entwurf ueber JSON Pointer und prueft ihn im selben Aufruf: " +
        "geaendert wird ohnehin nur, um danach zu pruefen. Mehrere Patches auf einmal sind " +
        "der Regelfall. Schlaegt einer fehl, bleibt der Entwurf **unveraendert**, es gibt " +
        "keinen halb angewandten Stapel.",
      inputSchema: {
        entwurf: z.string().describe("Kennung aus entwurf_anlegen oder aas_datei_lesen."),
        patches: z.array(PATCH).describe("Werden der Reihe nach angewandt."),
        anhaenge: z.array(z.string()).nullish().describe("Wie bei entwurf_anlegen."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (eingabe) => alsInhalt(await entwurfAendern(umgebung, eingabe)),
  );

  server.registerTool(
    "entwurf_lesen",
    {
      title: "Entwurf lesen",
      description:
        "Zeigt einen Entwurf oder einen Ausschnitt daraus. Vor einem Patch zu nehmen, wenn " +
        "unklar ist, an welchem Index ein Element steht.",
      inputSchema: {
        entwurf: z.string().describe("Kennung aus entwurf_anlegen oder aas_datei_lesen."),
        pfad: z
          .string()
          .nullish()
          .describe(
            "JSON Pointer auf den gewuenschten Ausschnitt, etwa /submodels/0. Ohne pfad " +
              "kommt das ganze Environment.",
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (eingabe) => alsInhalt(entwurfAnsehen(umgebung, eingabe)),
  );

  server.registerTool(
    "anhang_hochladen",
    {
      title: "Anhang hochladen",
      description:
        "Legt eine Datei in der Ablage ab und gibt einen Token zurueck, der als " +
        "anhaenge[].token an aas_datei_erzeugen geht. Gegenueber base64 direkt am " +
        "Container: die Bytes gehen genau einmal durch das Gespraech und ueberstehen jeden " +
        "weiteren Versuch. Liegt die Datei im Netz, ist die url-Quelle noch besser, dann " +
        "holt der Server sie selbst. Kopf und Fuss der Bytes werden gegen contentType " +
        "geprueft: eine abgeschnittene Datei wird abgelehnt und nicht abgelegt. Passt sie " +
        "nicht in einen Aufruf, stueckweise mit teil und token schicken.",
      inputSchema: {
        base64: z.string().describe("Die Bytes als base64, je Aufruf bis 2 MB."),
        dateiname: z.string().nullish().describe("Nur zur Wiedererkennung, etwa datenblatt.pdf."),
        contentType: z
          .string()
          .nullish()
          .describe(
            `Erlaubt: ${ERLAUBTE_TYPEN.join(", ")}. Bei einer Fortsetzung mit token ` +
              "wegzulassen, der Typ steht schon fest.",
          ),
        groesse: z
          .number()
          .nullish()
          .describe(
            "Zugesagte Groesse der **ganzen** Datei in Bytes. Weicht das Angekommene ab, " +
              "wird abgelehnt. Freiwillig, aber die einzige lueckenlose Zusage neben sha256.",
          ),
        sha256: z
          .string()
          .nullish()
          .describe(
            "Zugesagte Pruefsumme der **ganzen** Datei, 64 Stellen hex. Beim letzten Teil " +
              "eines stueckweisen Uploads verlangt.",
          ),
        token: z
          .string()
          .nullish()
          .describe("Ohne: ein neuer Upload. Mit: an den laufenden Upload anhaengen."),
        teil: z
          .number()
          .nullish()
          .describe(
            "1-basierte Folgenummer. Ohne Angabe ein einteiliger Upload. Eine falsche " +
              "Nummer laesst den Upload unveraendert und nennt die erwartete.",
          ),
        letzter: z
          .boolean()
          .nullish()
          .describe(
            "true schliesst den Upload ab. Erst dann werden Kopf, Fuss und sha256 ueber " +
              "alle Teile geprueft; faellt eine Pruefung durch, wird der Token verworfen. " +
              "Ein unvollstaendiger Token taugt nicht als Anhangsquelle.",
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (eingabe) => alsInhalt(anhangHochladen(umgebung, eingabe)),
  );

  server.registerTool(
    "aas_pruefen",
    {
      title: "AAS pruefen",
      description:
        "Prueft ein AAS Environment gegen das Metamodell 3.1. Liefert Verstoesse mit " +
        "Regelkennung (etwa AASd-131) und Pfad sowie Datenwarnungen, dazu eine Bilanz der " +
        "Anhaenge: welches File-Element aufgeloest ist, welches ins Leere zeigt, welches " +
        "extern verweist und welcher Anhang von niemandem gebraucht wird. Wer mit einem " +
        "Entwurf arbeitet, braucht dieses Werkzeug selten: entwurf_anlegen und " +
        "entwurf_aendern pruefen bereits mit.",
      inputSchema: {
        environment: z
          .string()
          .nullish()
          .describe("Das vollstaendige AAS Environment als JSON-Text, Metamodell 3.1."),
        entwurf: z
          .string()
          .nullish()
          .describe("Statt environment: die Kennung aus entwurf_anlegen. Genau eines von beidem."),
        anhaenge: z
          .array(z.string())
          .nullish()
          .describe(
            "Die Paketpfade der vorhandenen Anhaenge, ohne Bytes. Ohne sie gilt jedes " +
              "File-Element als unaufgeloest.",
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (eingabe) => alsInhalt(await aasPruefen(umgebung, eingabe)),
  );

  server.registerTool(
    "aas_datei_erzeugen",
    {
      title: "AAS-Datei erzeugen",
      description:
        "Schreibt ein Environment als JSON, XML oder AASX-Container und gibt einen " +
        "Download-Link zurueck, der 24 Stunden gilt. Anhaenge kommen nur in ein AASX: je " +
        "Anhang ein Paketpfad und genau eine Quelle aus url, base64 oder token. Zeigt " +
        "assetInformation.defaultThumbnail auf einen dieser Pfade, wird die Vorschau " +
        "zusaetzlich als Paket-Thumbnail gesetzt. Zuvor pruefen, bei einem Entwurf ist das " +
        "schon geschehen.",
      inputSchema: {
        environment: z
          .string()
          .nullish()
          .describe("Das vollstaendige AAS Environment als JSON-Text."),
        entwurf: z
          .string()
          .nullish()
          .describe("Statt environment: die Kennung aus entwurf_anlegen. Genau eines von beidem."),
        format: z
          .enum(["json", "xml", "aasx"])
          .describe("aasx ist der uebliche Austauschcontainer, json der einfachste Fall."),
        dateiname: z.string().nullish().describe("Name ohne Endung. null vergibt „environment“."),
        anhaenge: z
          .array(ANHANG)
          .nullish()
          .describe("Nur bei format aasx. Hoechstens 25 Stueck, zusammen hoechstens 100 MB."),
      },
      // Die Datei entsteht neu und ueberschreibt nichts, deshalb idempotent und nicht
      // destruktiv. `openWorldHint` ist wahr, sobald ein Anhang ueber url kommt.
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (eingabe) => alsInhalt(await aasDateiErzeugen(umgebung, eingabe)),
  );

  server.registerTool(
    "aas_datei_lesen",
    {
      title: "AAS-Datei lesen",
      description:
        "Liest eine vorhandene AAS als JSON, XML oder AASX und gibt sie als Environment " +
        "im Metamodell 3.1 zurueck, 3.0 wird dabei angehoben, **und legt gleich einen " +
        "Entwurf daraus an**. Die Anhaenge eines AASX gehen nicht verloren: je Anhang kommt " +
        "ein token zurueck, das unveraendert als Quelle in aas_datei_erzeugen taugt. " +
        "Entweder url oder inhalt angeben.",
      inputSchema: {
        url: z.string().nullish().describe("https-Adresse der Datei. Nur https."),
        inhalt: z.string().nullish().describe("Der Dateiinhalt als Text, fuer JSON und XML."),
        dateiname: z.string().nullish().describe("Hilft bei der Formaterkennung, etwa geraet.aasx."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (eingabe) => alsInhalt(await aasDateiLesen(umgebung, eingabe)),
  );

  return server;
}

/** Ein Werkzeugergebnis in die Form, die das Protokoll erwartet. */
function alsInhalt(ergebnis: Ergebnis) {
  return {
    content: [{ type: "text" as const, text: ergebnis.text }],
    ...(ergebnis.istFehler === true ? { isError: true } : {}),
  };
}
