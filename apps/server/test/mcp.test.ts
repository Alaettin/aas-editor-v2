import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { denormalize } from "@aas-editor/core";
import { importFile } from "@aas-editor/core/io";
import type { FastifyInstance } from "fastify";
import { startTestServer, type TestServer } from "./helpers/app.js";

/**
 * Der MCP-Zugang, gefahren wie jeder andere Test ueber `app.inject()`: echte Instanz,
 * echte Migrationen, kein Netzwerk und kein Port.
 *
 * Geprueft wird das Protokoll von aussen, nicht die Werkzeugfunktionen einzeln. Ein
 * Werkzeug, das fuer sich richtig rechnet, aber nicht angemeldet ist oder ein Schema
 * traegt, das der Klient ablehnt, ist im Chat trotzdem nicht da.
 */

let server: TestServer;
let app: FastifyInstance;

beforeAll(async () => {
  server = await startTestServer();
  app = server.app;
});

afterAll(async () => {
  await server.close();
});

interface RpcRumpf {
  readonly result?: Record<string, unknown>;
  readonly error?: { code: number; message: string };
}

interface RpcAntwort extends RpcRumpf {
  readonly status: number;
}

let laufendeId = 0;

async function rpc(methode: string, params?: unknown): Promise<RpcAntwort> {
  laufendeId += 1;
  const antwort = await app.inject({
    method: "POST",
    url: "/api/mcp",
    headers: {
      "content-type": "application/json",
      // Beides, so verlangt es Streamable HTTP, auch wenn der Server hier JSON antwortet.
      accept: "application/json, text/event-stream",
    },
    payload: { jsonrpc: "2.0", id: laufendeId, method: methode, ...(params ? { params } : {}) },
  });

  if (antwort.statusCode >= 400 && antwort.payload === "") {
    return { status: antwort.statusCode };
  }
  const rumpf = antwort.json() as RpcRumpf;
  return { ...rumpf, status: antwort.statusCode };
}

/** Ein Werkzeugaufruf, samt Auspacken des Textinhalts. */
async function ruf(
  name: string,
  args: Record<string, unknown>,
): Promise<{ istFehler: boolean; daten: Record<string, unknown> }> {
  const antwort = await rpc("tools/call", { name, arguments: args });
  expect(antwort.error, `${name} antwortete mit einem Protokollfehler`).toBeUndefined();
  const inhalt = (antwort.result?.["content"] as { type: string; text: string }[]) ?? [];
  const ersteZeile = inhalt[0];
  expect(ersteZeile, `${name} lieferte keinen Inhalt`).toBeDefined();
  return {
    istFehler: antwort.result?.["isError"] === true,
    daten: JSON.parse(ersteZeile?.text ?? "{}") as Record<string, unknown>,
  };
}

/** Das kleinste Environment, das die Pruefung fehlerfrei passiert. */
const GUELTIG = {
  submodels: [
    {
      modelType: "Submodel",
      id: "urn:test:submodel:1",
      idShort: "Typenschild",
      submodelElements: [
        {
          modelType: "Property",
          idShort: "Hersteller",
          valueType: "xs:string",
          value: "AXON",
        },
      ],
    },
  ],
};

describe("Protokoll", () => {
  it("meldet sich an und nennt Name und Fassung", async () => {
    const antwort = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    expect(antwort.status).toBe(200);
    expect(antwort.result?.["serverInfo"]).toMatchObject({ name: "axon-editor" });
  });

  it("bietet genau die zehn Werkzeuge", async () => {
    const antwort = await rpc("tools/list");
    const namen = (antwort.result?.["tools"] as { name: string }[]).map((w) => w.name).sort();
    expect(namen).toEqual([
      "aas_datei_erzeugen",
      "aas_datei_lesen",
      "aas_pruefen",
      "aas_schema",
      "aas_vorlage",
      "anhang_hochladen",
      "entwurf_aendern",
      "entwurf_anlegen",
      "entwurf_lesen",
      "teilmodell_erzeugen",
    ]);
  });

  it("weist GET ab, statt eine Verbindung offen zu halten", async () => {
    const antwort = await app.inject({ method: "GET", url: "/api/mcp" });
    expect(antwort.statusCode).toBe(405);
  });
});

describe("aas_schema", () => {
  it("nennt die Felder einer Property samt Geruest", async () => {
    const { daten } = await ruf("aas_schema", { art: "Property" });
    const felder = (daten["felder"] as { name: string; pflicht: boolean }[]).map((f) => f.name);
    expect(felder).toContain("valueType");
    expect(felder).toContain("value");
    expect(daten["beispiel"]).toMatchObject({ modelType: "Property" });
  });

  it("liefert ohne art die Uebersicht mit den Kindlisten", async () => {
    const { daten } = await ruf("aas_schema", {});
    const arten = daten["arten"] as { name: string; kindlisten: string[] }[];
    const umgebung = arten.find((a) => a.name === "Environment");
    expect(umgebung?.kindlisten).toEqual([
      "assetAdministrationShells",
      "submodels",
      "conceptDescriptions",
    ]);
  });

  it("meldet eine unbekannte Art als Werkzeugfehler, nicht als Absturz", async () => {
    const { istFehler, daten } = await ruf("aas_schema", { art: "Widget" });
    expect(istFehler).toBe(true);
    expect(String(daten["hinweis"])).toContain("Property");
  });
});

describe("aas_pruefen", () => {
  it("meldet ein gueltiges Environment ohne Befund", async () => {
    const { daten } = await ruf("aas_pruefen", { environment: JSON.stringify(GUELTIG) });
    expect(daten["verstoesse"]).toBe(0);
    expect(daten["warnungen"]).toBe(0);
  });

  it("meldet einen leeren Pflichtwert als Verstoss mit Regelkennung", async () => {
    const leereId = { submodels: [{ modelType: "Submodel", id: "", idShort: "Kaputt" }] };
    const { istFehler, daten } = await ruf("aas_pruefen", {
      environment: JSON.stringify(leereId),
    });
    expect(istFehler).toBe(false);
    expect(daten["verstoesse"]).toBe(1);
    expect((daten["befunde"] as { pfad: string }[])[0]?.pfad).toContain("submodels[0]");
  });

  /*
   * Der Sonderfall, der lange als Werkzeugfehler herauskam: fehlt ein Pflichtfeld
   * **ganz**, baut die SDK das Modell nicht auf und die Pruefung faellt aus. Das ist
   * trotzdem ein Befund und kein Absturz, sonst steht das Modell ohne Anhaltspunkt da.
   */
  it("meldet ein ganz fehlendes Pflichtfeld als Befund, nicht als Absturz", async () => {
    const ohneId = { submodels: [{ modelType: "Submodel", idShort: "Kaputt" }] };
    const { istFehler, daten } = await ruf("aas_pruefen", { environment: JSON.stringify(ohneId) });
    expect(istFehler).toBe(false);
    expect(daten["verstoesse"]).toBe(1);
    const befund = (daten["befunde"] as { pfad: string; text: string }[])[0];
    expect(befund?.text).toContain("'id'");
    expect(befund?.pfad).toContain("submodels[0]");
    expect(String(daten["urteil"])).toContain("Pflichtfeld");
  });

  it("gibt kaputtes JSON als lesbaren Werkzeugfehler zurueck", async () => {
    const { istFehler, daten } = await ruf("aas_pruefen", { environment: "{ das ist kein json" });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("kein gueltiges JSON");
  });
});

describe("aas_datei_erzeugen", () => {
  it("schreibt ein AASX, und der Link liefert eine Datei, die wieder lesbar ist", async () => {
    const { daten } = await ruf("aas_datei_erzeugen", {
      environment: JSON.stringify(GUELTIG),
      format: "aasx",
      dateiname: "Temperatursensor",
    });
    expect(daten["dateiname"]).toBe("Temperatursensor.aasx");
    expect(daten["verstoesse"]).toBe(0);

    const url = new URL(String(daten["url"]));
    const download = await app.inject({ method: "GET", url: url.pathname });
    expect(download.statusCode).toBe(200);
    expect(download.headers["content-disposition"]).toContain("Temperatursensor.aasx");
    expect(download.rawPayload.byteLength).toBe(daten["groesse"]);

    /*
     * Der Rundlauf, und der ist der eigentliche Punkt dieses Tests: dass der Download
     * 200 gibt, sagt nur, dass Bytes fliessen. Erst der Import beweist, dass es ein
     * AASX-Paket ist, das der Editor wieder oeffnet.
     */
    const gelesen = await importFile(new Uint8Array(download.rawPayload), "Temperatursensor.aasx");
    expect(gelesen.format).toBe("aasx");
    const zurueck = denormalize(gelesen.model);
    expect((zurueck["submodels"] as { idShort: string }[])[0]?.idShort).toBe("Typenschild");
  });

  it("erzeugt die Datei auch mit Verstoessen und sagt es dazu", async () => {
    const leereId = { submodels: [{ modelType: "Submodel", id: "", idShort: "Kaputt" }] };
    const { istFehler, daten } = await ruf("aas_datei_erzeugen", {
      environment: JSON.stringify(leereId),
      format: "json",
      dateiname: null,
    });
    expect(istFehler).toBe(false);
    expect(daten["dateiname"]).toBe("environment.json");
    expect(daten["verstoesse"] as number).toBeGreaterThan(0);
    expect(String(daten["hinweis"])).toContain("trotz Befunden");
  });

  it("schreibt nichts, wenn ein Pflichtfeld ganz fehlt, und nennt den Grund", async () => {
    const ohneId = { submodels: [{ modelType: "Submodel", idShort: "Kaputt" }] };
    const { istFehler, daten } = await ruf("aas_datei_erzeugen", {
      environment: JSON.stringify(ohneId),
      format: "aasx",
      dateiname: null,
    });
    expect(istFehler).toBe(true);
    expect(daten["url"]).toBeUndefined();
    expect((daten["befunde"] as { text: string }[])[0]?.text).toContain("'id'");
  });

  it("gibt einem erfundenen Token 404", async () => {
    const erfunden = "a".repeat(43);
    const antwort = await app.inject({ method: "GET", url: `/api/mcp/dateien/${erfunden}` });
    expect(antwort.statusCode).toBe(404);
  });

  it("laesst sich mit einem Pfad im Token nicht aus dem Verzeichnis locken", async () => {
    const antwort = await app.inject({
      method: "GET",
      url: "/api/mcp/dateien/..%2F..%2Faas-editor.db",
    });
    expect(antwort.statusCode).toBe(404);
  });
});

describe("aas_datei_lesen", () => {
  it("liest JSON aus dem Inhalt und gibt ein Environment zurueck", async () => {
    const { istFehler, daten } = await ruf("aas_datei_lesen", {
      inhalt: JSON.stringify(GUELTIG),
      url: null,
      dateiname: "geraet.json",
    });
    expect(istFehler).toBe(false);
    expect(daten["format"]).toBe("json");
    const umgebung = daten["environment"] as Record<string, unknown>;
    expect((umgebung["submodels"] as unknown[]).length).toBe(1);
  });

  it("weist alles ab, was nicht https ist", async () => {
    const { istFehler, daten } = await ruf("aas_datei_lesen", {
      url: "file:///etc/passwd",
      inhalt: null,
      dateiname: null,
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("https");
  });

  it("verlangt genau eine Quelle", async () => {
    const leer = await ruf("aas_datei_lesen", { url: null, inhalt: null, dateiname: null });
    expect(leer.istFehler).toBe(true);
    const beides = await ruf("aas_datei_lesen", {
      url: "https://example.invalid/a.json",
      inhalt: "{}",
      dateiname: null,
    });
    expect(beides.istFehler).toBe(true);
  });
});
