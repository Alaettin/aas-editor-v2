import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";
import {
  aasDateiErzeugen,
  aasDateiLesen,
  aasPruefen,
  aasSchema,
  ALLE_ARTEN,
  type Ergebnis,
  type Umgebung,
} from "./werkzeuge.js";

/**
 * Der MCP-Server des AXON Editors.
 *
 * Er ist eine **Werkbank, kein Fernzugriff**: er kennt weder Projekte noch Benutzer noch
 * die Datenbank. Was er kann, kann ein Sprachmodell allein nicht, naemlich das
 * AAS-Metamodell verlaesslich treffen. Die Pruefung kommt aus `verification.verify()`
 * der offiziellen SDK, die Formatschreiber sind dieselben wie im Editor.
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
  "Ablauf: erst aas_schema fuer die Feldnamen der gebrauchten Arten, dann das " +
  "Environment entwerfen, dann aas_pruefen bis keine Verstoesse mehr bleiben, erst " +
  "dann aas_datei_erzeugen.";

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
        "Jedes Element traegt sein modelType.",
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
    "aas_pruefen",
    {
      title: "AAS pruefen",
      description:
        "Prueft ein AAS Environment gegen das Metamodell 3.1. Liefert Verstoesse mit " +
        "Regelkennung (etwa AASd-131) und Pfad sowie Datenwarnungen. Der Rueckkanal, " +
        "ueber den ein Entwurf repariert wird: nach jeder groesseren Aenderung aufrufen.",
      inputSchema: {
        environment: z
          .string()
          .describe("Das vollstaendige AAS Environment als JSON-Text, Metamodell 3.1."),
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
        "Download-Link zurueck, der eine Stunde gilt. Prueft dabei mit und meldet " +
        "verbliebene Befunde. Zuvor aas_pruefen aufrufen.",
      inputSchema: {
        environment: z.string().describe("Das vollstaendige AAS Environment als JSON-Text."),
        format: z
          .enum(["json", "xml", "aasx"])
          .describe("aasx ist der uebliche Austauschcontainer, json der einfachste Fall."),
        dateiname: z
          .string()
          .nullish()
          .describe("Name ohne Endung. null vergibt „environment“."),
      },
      // Die Datei entsteht neu und ueberschreibt nichts, deshalb idempotent und nicht
      // destruktiv. `openWorldHint` bleibt falsch: der Server ruft nichts Fremdes auf.
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (eingabe) => alsInhalt(await aasDateiErzeugen(umgebung, eingabe)),
  );

  server.registerTool(
    "aas_datei_lesen",
    {
      title: "AAS-Datei lesen",
      description:
        "Liest eine vorhandene AAS als JSON, XML oder AASX und gibt sie als Environment " +
        "im Metamodell 3.1 zurueck, 3.0 wird dabei angehoben. Fuer „nimm diese " +
        "vorhandene AAS als Vorlage“. Entweder url oder inhalt angeben, nicht beides.",
      inputSchema: {
        url: z.string().nullish().describe("https-Adresse der Datei. Nur https."),
        inhalt: z.string().nullish().describe("Der Dateiinhalt als Text, fuer JSON und XML."),
        dateiname: z
          .string()
          .nullish()
          .describe("Hilft bei der Formaterkennung, etwa geraet.aasx."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (eingabe) => alsInhalt(await aasDateiLesen(eingabe)),
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
