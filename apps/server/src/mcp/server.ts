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
  ERLAUBTE_TYPEN,
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
  "Ablauf: fuer ein Teilmodell nach IDTA zuerst aas_vorlage, sonst aas_schema fuer die " +
  "Feldnamen. Dann das Environment entwerfen, dann aas_pruefen bis keine Verstoesse mehr " +
  "bleiben, erst dann aas_datei_erzeugen.";

/** Ein Anhang, so wie ihn `aas_datei_erzeugen` entgegennimmt. */
const ANHANG = z.object({
  pfad: z
    .string()
    .describe("Paketpfad im Container, absolut, etwa /aasx/files/datenblatt.pdf."),
  contentType: z
    .string()
    .nullish()
    .describe(`null uebernimmt den Typ der Quelle. Erlaubt: ${ERLAUBTE_TYPEN.join(", ")}.`),
  url: z.string().nullish().describe("https-Adresse, von der der Server die Datei holt."),
  base64: z.string().nullish().describe("Bytes als base64, nur bis 2 MB."),
  token: z
    .string()
    .nullish()
    .describe("Token aus POST /api/mcp/anhaenge oder aus aas_datei_lesen."),
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
        " Das Environment wird als JSON-Text uebergeben und hat die Form " +
        '{"assetAdministrationShells": [], "submodels": [], "conceptDescriptions": []}. ' +
        "Jedes Element traegt sein modelType. Eine leere Liste ist dabei ein Verstoss: " +
        "einen Slot, der nichts enthaelt, ganz weglassen.",
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
          .enum(["pflicht", "vollstaendig"])
          .nullish()
          .describe(
            "pflicht (Vorgabe) liefert nur die Pflichtelemente mit leeren Werten, " +
              "vollstaendig die ganze Vorlage samt conceptDescriptions.",
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (eingabe) => alsInhalt(aasVorlage(eingabe)),
  );

  server.registerTool(
    "aas_pruefen",
    {
      title: "AAS pruefen",
      description:
        "Prueft ein AAS Environment gegen das Metamodell 3.1. Liefert Verstoesse mit " +
        "Regelkennung (etwa AASd-131) und Pfad sowie Datenwarnungen, dazu eine Bilanz der " +
        "Anhaenge: welches File-Element aufgeloest ist, welches ins Leere zeigt, welches " +
        "extern verweist und welcher Anhang von niemandem gebraucht wird. Der Rueckkanal, " +
        "ueber den ein Entwurf repariert wird: nach jeder groesseren Aenderung aufrufen.",
      inputSchema: {
        environment: z
          .string()
          .describe("Das vollstaendige AAS Environment als JSON-Text, Metamodell 3.1."),
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
    async (eingabe) => alsInhalt(await aasPruefen(eingabe)),
  );

  server.registerTool(
    "aas_datei_erzeugen",
    {
      title: "AAS-Datei erzeugen",
      description:
        "Schreibt ein Environment als JSON, XML oder AASX-Container und gibt einen " +
        "Download-Link zurueck, der eine Stunde gilt. Anhaenge kommen nur in ein AASX: je " +
        "Anhang ein Paketpfad und genau eine Quelle aus url, base64 oder token. Zeigt " +
        "assetInformation.defaultThumbnail auf einen dieser Pfade, wird die Vorschau " +
        "zusaetzlich als Paket-Thumbnail gesetzt. Zuvor aas_pruefen aufrufen.",
      inputSchema: {
        environment: z.string().describe("Das vollstaendige AAS Environment als JSON-Text."),
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
        "im Metamodell 3.1 zurueck, 3.0 wird dabei angehoben. Die Anhaenge eines AASX " +
        "gehen dabei nicht verloren: je Anhang kommt ein token zurueck, das unveraendert " +
        "als Quelle in aas_datei_erzeugen taugt. Entweder url oder inhalt angeben.",
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
