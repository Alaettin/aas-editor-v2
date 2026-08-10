import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { startTestServer, type TestServer } from "./helpers/app.js";
import { ruf } from "./helpers/mcp.js";

/**
 * Vom Datenblatt zur AAS, ohne Metamodell-Geruest.
 *
 * Der Anlass steht im Feldbericht vom 10.08.2026: fuer drei Teilmodelle mussten rund
 * fuenfhundert Zeilen JSON geschickt werden, und vier Fuenftel davon waren reine
 * semanticId-Boilerplate, achtzigmal derselbe ExternalReference-Block. Der Server kennt
 * sie aus den Dateien des Herausgebers. Was hier geprueft wird, ist deshalb nicht nur, dass
 * das Ergebnis stimmt, sondern dass der **Aufruf** klein bleibt.
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

/** Die Werte eines echten Geraets, so wie sie im Datenblatt stehen. */
const NAMEPLATE_WERTE = {
  "/URIOfTheProduct": "https://endress.com/5P3B01000",
  "/ManufacturerName": { de: "Endress+Hauser", en: "Endress+Hauser" },
  "/ManufacturerProductDesignation": { de: "Liquiphant FTL51B" },
  "/OrderCodeOfManufacturer": { de: "5P3B" },
  "/SerialNumber": "5P3B01000",
  "/YearOfConstruction": "2024",
  "/DateOfManufacture": "2024-03-17",
  "/AddressInformation/Street": { de: "Hauptstrasse 1" },
  "/AddressInformation/Zipcode": { de: "79689" },
  "/AddressInformation/CityTown": { de: "Maulburg" },
};

describe("teilmodell_erzeugen", () => {
  it("baut ein Teilmodell aus Werten und setzt semanticId und IRDIs selbst", async () => {
    const { istFehler, daten } = await ruf(app, "teilmodell_erzeugen", {
      kennung: "nameplate-3-0",
      werte: NAMEPLATE_WERTE,
      idShort: "Nameplate",
      id: "urn:eh:ftl51b:nameplate",
      entwurf: null,
      anhaenge: null,
    });
    expect(istFehler).toBe(false);

    const submodel = daten["submodel"] as Record<string, unknown>;
    expect(submodel["id"]).toBe("urn:eh:ftl51b:nameplate");
    expect(submodel["kind"]).toBe("Instance");

    const text = JSON.stringify(submodel);
    // Die IRDIs stehen da, ohne dass sie jemand geschickt haette. Das ist der ganze Punkt.
    expect(text).toContain("0173-1#02-AAO677#004"); // ManufacturerName
    expect(text).toContain("Endress+Hauser");
    // Und die Sprachtexte sind in der Form, die das Metamodell verlangt.
    expect(text).toContain('{"language":"de","text":"Liquiphant FTL51B"}');
  });

  /*
   * Die eigentliche Zusage dieser Runde, als Zahl. Gemessen wird der **Aufruf**, nicht die
   * Antwort: er ist das, was durch den Gespraechsspeicher geht und was frueher rund
   * fuenfhundert Zeilen Environment war.
   */
  it("haelt den Aufruf um ein Vielfaches kleiner als das erzeugte Teilmodell", async () => {
    const aufruf = JSON.stringify({ kennung: "nameplate-3-0", werte: NAMEPLATE_WERTE }).length;
    const { daten } = await ruf(app, "teilmodell_erzeugen", {
      kennung: "nameplate-3-0",
      werte: NAMEPLATE_WERTE,
      idShort: null,
      id: null,
      entwurf: null,
      anhaenge: null,
    });
    const ergebnis = JSON.stringify(daten["submodel"]).length;
    expect(ergebnis / aufruf, `Aufruf ${aufruf}, Teilmodell ${ergebnis}`).toBeGreaterThan(5);
  });

  it("erzeugt aus einem Vorlagenglied mehrere Listenglieder", async () => {
    const { daten } = await ruf(app, "teilmodell_erzeugen", {
      kennung: "nameplate-3-0",
      werte: { "/Markings/0/MarkingName": "CE", "/Markings/1/MarkingName": "ATEX" },
      idShort: null,
      id: null,
      entwurf: null,
      anhaenge: null,
    });
    const submodel = daten["submodel"] as Record<string, unknown>;
    const markings = (submodel["submodelElements"] as Record<string, unknown>[]).find(
      (e) => e["idShort"] === "Markings",
    );
    expect((markings?.["value"] as unknown[]).length).toBe(2);
    expect(JSON.stringify(markings)).toContain("ATEX");

    /*
     * Die IDTA schreibt an ihr Markings-Exemplar `"idShort": ""`. Uebernommen ergibt das
     * je Glied drei Verstoesse (leer, Namensmuster, Eindeutigkeit unter Geschwistern), und
     * bei zwei Kennzeichnungen waren es sechs. Ein Glied einer SubmodelElementList traegt
     * gar keinen idShort.
     */
    for (const glied of markings?.["value"] as Record<string, unknown>[]) {
      expect(glied["idShort"]).toBeUndefined();
    }
  });

  it("erzeugt ein Environment, das die Pruefung ohne Verstoss besteht", async () => {
    const { daten } = await ruf(app, "entwurf_anlegen", {
      environment: null,
      kopf: {
        globalAssetId: "https://endress.com/id/5P3B01000",
        idShort: "LiquiphantFTL51B",
        assetKind: "Instance",
        id: null,
      },
      teilmodelle: [
        {
          kennung: "nameplate-3-0",
          werte: { ...NAMEPLATE_WERTE, "/Markings/0/MarkingName": "CE", "/Markings/1/MarkingName": "ATEX" },
          id: null,
          idShort: "Nameplate",
        },
      ],
      anhaenge: null,
    });
    expect(daten["befunde"] ?? []).toEqual([]);
    expect(daten["verstoesse"]).toBe(0);
  });

  /*
   * Bis zum 10.08.2026 nannte die Meldung eines falschen Pfades die Kinder der **Wurzel**.
   * Bei einem tiefen Pfad war das die falsche Auskunft.
   */
  it("nennt bei einem falschen Pfad die Geschwister an der Bruchstelle", async () => {
    const { istFehler, daten } = await ruf(app, "teilmodell_erzeugen", {
      kennung: "nameplate-3-0",
      werte: { "/AddressInformation/Strasse": "Hauptstrasse 1" },
      idShort: null,
      id: null,
      entwurf: null,
      anhaenge: null,
    });
    expect(istFehler).toBe(true);
    const hinweis = String(daten["hinweis"]);
    // Die Nachbarn von Strasse, nicht die von ganz oben.
    expect(hinweis).toContain("Street");
    expect(hinweis).toContain("Zipcode");
    expect(hinweis).not.toContain("ManufacturerName");
  });

  it("lehnt einen Wert ab, der nicht zum valueType der Vorlage passt", async () => {
    const { istFehler, daten } = await ruf(app, "teilmodell_erzeugen", {
      kennung: "nameplate-3-0",
      werte: { "/DateOfManufacture": "Sommer 2024" },
      idShort: null,
      id: null,
      entwurf: null,
      anhaenge: null,
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("xs:date");
    expect(String(daten["hinweis"])).toContain("JJJJ-MM-TT");
  });

  it("meldet die Pflichtfelder, die noch auf ihrem Platzhalter stehen", async () => {
    const { daten } = await ruf(app, "teilmodell_erzeugen", {
      kennung: "nameplate-3-0",
      werte: { "/SerialNumber": "5P3B01000" },
      idShort: null,
      id: null,
      entwurf: null,
      anhaenge: null,
    });
    const offen = daten["offen"] as string[];
    expect(offen.some((o) => o.includes("ManufacturerName"))).toBe(true);
    // Und was gesetzt wurde, taucht dort nicht auf.
    expect(offen.some((o) => o.includes("SerialNumber"))).toBe(false);
  });
});

describe("entwurf_anlegen aus Vorlagen", () => {
  it("baut Schale, Teilmodelle und die Verweise dazwischen", async () => {
    const { istFehler, daten } = await ruf(app, "entwurf_anlegen", {
      environment: null,
      kopf: {
        globalAssetId: "https://endress.com/id/5P3B01000",
        idShort: "LiquiphantFTL51B",
        assetKind: "Instance",
        id: null,
      },
      teilmodelle: [
        { kennung: "nameplate-3-0", werte: NAMEPLATE_WERTE, id: null, idShort: null },
        {
          kennung: "technicaldata-2-0",
          werte: {
            "/GeneralInformation/ManufacturerName": "Endress+Hauser",
            "/GeneralInformation/ManufacturerProductDesignation": { de: "Liquiphant FTL51B" },
            "/GeneralInformation/ManufacturerArticleNumber": "FTL51B",
            "/GeneralInformation/ManufacturerOrderCode": "5P3B",
          },
          id: null,
          idShort: null,
        },
      ],
      anhaenge: null,
    });

    expect(istFehler).toBe(false);
    expect(typeof daten["entwurf"]).toBe("string");
    expect(daten["verstoesse"]).toBe(0);

    // Der Verweis von der Schale ist der Punkt, der in der echten Sitzung vergessen wurde.
    const { daten: gelesen } = await ruf(app, "entwurf_lesen", {
      entwurf: String(daten["entwurf"]),
      pfad: null,
    });
    const env = gelesen["environment"] as Record<string, unknown>;
    const shells = env["assetAdministrationShells"] as Record<string, unknown>[];
    const submodels = env["submodels"] as Record<string, unknown>[];
    expect(submodels.length).toBe(2);
    expect((shells[0]?.["submodels"] as unknown[]).length).toBe(2);
    const verwiesen = JSON.stringify(shells[0]?.["submodels"]);
    for (const sm of submodels) expect(verwiesen).toContain(String(sm["id"]));
  });

  it("haengt ein weiteres Teilmodell an, ohne dass JSON zurueckgeht", async () => {
    const { daten: angelegt } = await ruf(app, "entwurf_anlegen", {
      environment: null,
      kopf: { globalAssetId: "https://beispiel.de/id/1", idShort: null, assetKind: null, id: null },
      teilmodelle: [{ kennung: "nameplate-3-0", werte: NAMEPLATE_WERTE, id: null, idShort: null }],
      anhaenge: null,
    });
    const entwurf = String(angelegt["entwurf"]);

    const { istFehler, daten } = await ruf(app, "teilmodell_erzeugen", {
      kennung: "handoverdocumentation-2-0-1",
      werte: {},
      entwurf,
      idShort: null,
      id: null,
      anhaenge: null,
    });
    expect(istFehler).toBe(false);
    // Kein Teilmodell in der Antwort: genau das spart die Uebertragung.
    expect(daten["submodel"]).toBeUndefined();
    expect((daten["angehaengt"] as Record<string, unknown>)["verknuepft"]).toBe(true);

    const { daten: gelesen } = await ruf(app, "entwurf_lesen", { entwurf, pfad: null });
    const env = gelesen["environment"] as Record<string, unknown>;
    expect((env["submodels"] as unknown[]).length).toBe(2);
  });

  it("laesst environment und kopf nicht nebeneinander zu", async () => {
    const { istFehler, daten } = await ruf(app, "entwurf_anlegen", {
      environment: JSON.stringify({ submodels: [] }),
      kopf: { globalAssetId: "https://beispiel.de/id/1", idShort: null, assetKind: null, id: null },
      teilmodelle: [{ kennung: "nameplate-3-0", werte: {}, id: null, idShort: null }],
      anhaenge: null,
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("schliessen sich aus");
  });

  it("verlangt eine globalAssetId und sagt wofuer", async () => {
    const { istFehler, daten } = await ruf(app, "entwurf_anlegen", {
      environment: null,
      kopf: { globalAssetId: "  ", idShort: null, assetKind: null, id: null },
      teilmodelle: [{ kennung: "nameplate-3-0", werte: {}, id: null, idShort: null }],
      anhaenge: null,
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("globalAssetId");
  });

  it("nennt eine unbekannte Vorlagenkennung samt der erlaubten", async () => {
    const { istFehler, daten } = await ruf(app, "entwurf_anlegen", {
      environment: null,
      kopf: { globalAssetId: "https://beispiel.de/id/1", idShort: null, assetKind: null, id: null },
      teilmodelle: [{ kennung: "nameplate-9-9", werte: {}, id: null, idShort: null }],
      anhaenge: null,
    });
    expect(istFehler).toBe(true);
    expect(String(daten["hinweis"])).toContain("nameplate-3-0");
  });
});
