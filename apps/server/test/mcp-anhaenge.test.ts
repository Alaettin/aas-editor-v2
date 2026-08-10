import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importFile } from "@aas-editor/core/io";
import type { FastifyInstance } from "fastify";
import { startTestServer, type TestServer } from "./helpers/app.js";
import {
  anhang,
  GUELTIG,
  MIT_ANHANG,
  multipart,
  PDF_BASE64,
  PDF_BYTES,
  PNG_BASE64,
  ruf,
} from "./helpers/mcp.js";

/**
 * Anhaenge und IDTA-Vorlagen.
 *
 * Der Anlass steht in der Projektakte: eine AAS mit Nameplate, TechnicalData und
 * HandoverDocumentation liess sich nicht ueber den Connector bauen, weil Datenblatt und
 * Bilder nicht in den Container passten und die IRDIs geraten werden mussten.
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

// --- Vorlagen -------------------------------------------------------------------------

/**
 * Entfernt die Auskunftsfelder, die `aas_vorlage` dem Geruest beilegt.
 *
 * `_kardinalitaet` ist kein Metamodell-Feld. Es steht im Geruest, weil es beim Ausfuellen
 * hilft, und muss vor dem Export weg. Genau das sagt auch der Hinweis des Werkzeugs.
 */
function ohneAuskunft(knoten: unknown): unknown {
  if (Array.isArray(knoten)) return knoten.map(ohneAuskunft);
  if (knoten === null || typeof knoten !== "object") return knoten;
  const out: Record<string, unknown> = {};
  for (const [schluessel, wert] of Object.entries(knoten as Record<string, unknown>)) {
    if (schluessel === "_kardinalitaet") continue;
    out[schluessel] = ohneAuskunft(wert);
  }
  return out;
}

describe("aas_vorlage", () => {
  it("nennt ohne kennung die drei Vorlagen mit ihrer semanticId", async () => {
    const { daten } = await ruf(app, "aas_vorlage", {});
    const liste = daten["vorlagen"] as { kennung: string; semanticId: string; idta: string }[];
    expect(liste.map((v) => v.kennung).sort()).toEqual([
      "handoverdocumentation-2-0-1",
      "nameplate-3-0",
      "technicaldata-2-0",
    ]);
    /*
     * Die IRDI ist der ganze Grund fuer dieses Werkzeug, und sie ist der Beleg dafuer,
     * dass sie aus Daten kommen muss: die Auftragsnotiz nannte `#001`, das ist die
     * Fassung 1.2. Die eingecheckte Vorlage 2.0.1 traegt `#003`.
     */
    const handover = liste.find((v) => v.kennung === "handoverdocumentation-2-0-1");
    expect(handover?.semanticId).toBe("0173-1#01-AHF578#003");
    expect(handover?.idta).toBe("IDTA 02004-2-0-1");
  });

  it("meldet eine unbekannte Kennung als Werkzeugfehler", async () => {
    const { istFehler, daten } = await ruf(app, "aas_vorlage", { kennung: "nameplate-1-0" });
    expect(istFehler).toBe(true);
    expect(String(daten["hinweis"])).toContain("nameplate-3-0");
  });

  /*
   * Der eigentliche Test dieses Werkzeugs. Ein Geruest, das die Pruefung nicht besteht,
   * ist wertlos: das Modell baute darauf auf und liefe erst beim Erzeugen gegen die Wand.
   * Deshalb je Vorlage einmal durch die **echte** Pruefung, nicht gegen eine erwartete
   * Feldliste.
   */
  for (const kennung of ["nameplate-3-0", "technicaldata-2-0", "handoverdocumentation-2-0-1"]) {
    it(`liefert fuer ${kennung} ein Geruest, das die Pruefung besteht`, async () => {
      const { istFehler, daten } = await ruf(app, "aas_vorlage", { kennung, umfang: "pflicht" });
      expect(istFehler).toBe(false);

      const submodel = ohneAuskunft(daten["submodel"]) as Record<string, unknown>;
      expect(submodel["kind"]).toBe("Instance");
      expect(submodel["id"]).toBeTruthy();

      const pruefung = await ruf(app, "aas_pruefen", {
        environment: JSON.stringify({ submodels: [submodel] }),
        anhaenge: null,
      });
      expect(pruefung.daten["verstoesse"], JSON.stringify(pruefung.daten["befunde"])).toBe(0);
    });
  }

  it("laesst bei umfang vollstaendig die Vorlage unangetastet", async () => {
    const { daten } = await ruf(app, "aas_vorlage", {
      kennung: "nameplate-3-0",
      umfang: "vollstaendig",
    });
    const env = daten["environment"] as Record<string, unknown>;
    expect((env["conceptDescriptions"] as unknown[]).length).toBeGreaterThan(0);
    const sm = (env["submodels"] as Record<string, unknown>[])[0];
    // Unveraendert heisst unveraendert: kind bleibt Template, die Qualifier bleiben drin.
    expect(sm?.["kind"]).toBe("Template");
  });

  it("dampft ein: das Pflicht-Geruest ist deutlich kleiner als die ganze Vorlage", async () => {
    const pflicht = await ruf(app, "aas_vorlage", { kennung: "technicaldata-2-0" });
    const voll = await ruf(app, "aas_vorlage", {
      kennung: "technicaldata-2-0",
      umfang: "vollstaendig",
    });
    expect(JSON.stringify(pflicht.daten["submodel"]).length).toBeLessThan(
      JSON.stringify(voll.daten["environment"]).length / 4,
    );
    expect(pflicht.daten["weggelassen"] as number).toBeGreaterThan(0);
  });
});

// --- Anhaenge im Container ------------------------------------------------------------

describe("Anhaenge in aas_datei_erzeugen", () => {
  it("schreibt base64-Anhaenge in den Container und findet sie beim Lesen wieder", async () => {
    const { istFehler, daten } = await ruf(app, "aas_datei_erzeugen", {
      environment: JSON.stringify(MIT_ANHANG),
      format: "aasx",
      dateiname: "mit-anhang",
      anhaenge: [
        anhang("/aasx/files/datenblatt.pdf", "application/pdf", { base64: PDF_BASE64 }),
        anhang("/aasx/files/vorschau.png", "image/png", { base64: PNG_BASE64 }),
      ],
    });
    expect(istFehler).toBe(false);

    const bilanz = daten["anhaenge"] as Record<string, unknown>;
    expect(bilanz["geschrieben"]).toEqual([
      "/aasx/files/datenblatt.pdf",
      "/aasx/files/vorschau.png",
    ]);
    expect(bilanz["fehlend"]).toEqual([]);
    // Das Vorschaubild liegt zusaetzlich unter dem Namen, an dem ein Paketleser sucht.
    expect(bilanz["thumbnail"]).toBe("/thumbnail.png");

    const download = await app.inject({
      method: "GET",
      url: new URL(String(daten["url"])).pathname,
    });
    const gelesen = await importFile(new Uint8Array(download.rawPayload), "mit-anhang.aasx");
    expect([...gelesen.attachments.keys()].sort()).toEqual([
      "/aasx/files/datenblatt.pdf",
      "/aasx/files/vorschau.png",
    ]);
    expect(gelesen.thumbnail?.path).toBe("/thumbnail.png");
    const pdf = gelesen.attachments.get("/aasx/files/datenblatt.pdf");
    expect(Buffer.from(pdf?.bytes ?? new Uint8Array()).toString("utf8")).toContain("%PDF-1.4");
  });

  it("nimmt einen hochgeladenen Anhang ueber seinen Token", async () => {
    const upload = await app.inject({
      method: "POST",
      url: "/api/mcp/anhaenge",
      ...multipart("datenblatt.pdf", "application/pdf", PDF_BYTES),
    });
    expect(upload.statusCode).toBe(201);
    const { token, groesse } = upload.json() as { token: string; groesse: number };
    expect(token).toHaveLength(43);
    expect(groesse).toBe(PDF_BYTES.byteLength);

    const { istFehler, daten } = await ruf(app, "aas_datei_erzeugen", {
      environment: JSON.stringify(MIT_ANHANG),
      format: "aasx",
      dateiname: null,
      // contentType bleibt null: er kommt aus dem Upload.
      anhaenge: [anhang("/aasx/files/datenblatt.pdf", null, { token })],
    });
    expect(istFehler).toBe(false);
    expect((daten["anhaenge"] as Record<string, unknown>)["geschrieben"]).toEqual([
      "/aasx/files/datenblatt.pdf",
    ]);
  });

  it("meldet einen unbekannten Token, statt ihn zu uebergehen", async () => {
    const { istFehler, daten } = await ruf(app, "aas_datei_erzeugen", {
      environment: JSON.stringify(GUELTIG),
      format: "aasx",
      dateiname: null,
      anhaenge: [anhang("/a.pdf", "application/pdf", { token: "b".repeat(43) })],
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("abgelaufen");
  });

  it("lehnt einen Upload ab, dessen Typ nicht auf der Liste steht", async () => {
    const upload = await app.inject({
      method: "POST",
      url: "/api/mcp/anhaenge",
      ...multipart("a.exe", "application/x-msdownload", Buffer.from("MZ")),
    });
    expect(upload.statusCode).toBe(400);
    expect((upload.json() as { code: string }).code).toBe("typ-nicht-zugelassen");
  });

  it("verweigert Anhaenge im JSON-Format, statt sie still zu verwerfen", async () => {
    const { istFehler, daten } = await ruf(app, "aas_datei_erzeugen", {
      environment: JSON.stringify(GUELTIG),
      format: "json",
      dateiname: null,
      anhaenge: [anhang("/a.pdf", "application/pdf", { base64: PDF_BASE64 })],
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("AASX");
  });

  it("laesst keinen Verzeichniswechsel in den Paketpfad", async () => {
    const { istFehler, daten } = await ruf(app, "aas_datei_erzeugen", {
      environment: JSON.stringify(GUELTIG),
      format: "aasx",
      dateiname: null,
      anhaenge: [anhang("/aasx/../../geheim.pdf", "application/pdf", { base64: PDF_BASE64 })],
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("Verzeichniswechsel");
  });

  it("lehnt einen nicht zugelassenen contentType auch ueber base64 ab", async () => {
    const { istFehler, daten } = await ruf(app, "aas_datei_erzeugen", {
      environment: JSON.stringify(GUELTIG),
      format: "aasx",
      dateiname: null,
      anhaenge: [anhang("/a.exe", "application/x-msdownload", { base64: PDF_BASE64 })],
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("nicht zugelassen");
  });

  it("verlangt genau eine Quelle je Anhang", async () => {
    const zwei = await ruf(app, "aas_datei_erzeugen", {
      environment: JSON.stringify(GUELTIG),
      format: "aasx",
      dateiname: null,
      anhaenge: [
        anhang("/a.pdf", "application/pdf", {
          base64: PDF_BASE64,
          url: "https://example.com/a.pdf",
        }),
      ],
    });
    expect(zwei.istFehler).toBe(true);
    expect(String(zwei.daten["fehler"])).toContain("mehrere Quellen");

    const keine = await ruf(app, "aas_datei_erzeugen", {
      environment: JSON.stringify(GUELTIG),
      format: "aasx",
      dateiname: null,
      anhaenge: [anhang("/a.pdf", "application/pdf", {})],
    });
    expect(keine.istFehler).toBe(true);
    expect(String(keine.daten["fehler"])).toContain("fehlt die Quelle");
  });
});

// --- Bilanz ---------------------------------------------------------------------------

describe("Anhangsbilanz in aas_pruefen", () => {
  it("unterscheidet aufgeloest, fehlend und extern", async () => {
    const env = {
      submodels: [
        {
          modelType: "Submodel",
          id: "urn:test:sm:doku",
          submodelElements: [
            { modelType: "File", idShort: "Da", contentType: "application/pdf", value: "/da.pdf" },
            { modelType: "File", idShort: "Weg", contentType: "application/pdf", value: "/weg.pdf" },
            {
              modelType: "File",
              idShort: "Extern",
              contentType: "application/pdf",
              value: "https://example.com/fern.pdf",
            },
          ],
        },
      ],
    };
    const { daten } = await ruf(app, "aas_pruefen", {
      environment: JSON.stringify(env),
      anhaenge: ["/da.pdf", "/niemand.pdf"],
    });
    const bilanz = daten["anhaenge"] as Record<string, unknown>;
    expect(bilanz["aufgeloest"]).toEqual(["/da.pdf"]);
    expect((bilanz["fehlend"] as { pfad: string }[]).map((f) => f.pfad)).toEqual(["/weg.pdf"]);
    expect((bilanz["extern"] as { url: string }[]).map((e) => e.url)).toEqual([
      "https://example.com/fern.pdf",
    ]);
    // Die Gegenrichtung, die es bisher nirgends gab: ein Anhang, den niemand braucht.
    expect(bilanz["unreferenziert"]).toEqual(["/niemand.pdf"]);
    expect(daten["anhangswarnung"]).toBeTruthy();
  });

  it("haelt einen fehlenden Anhang als Warnung, nicht als Verstoss", async () => {
    const { daten } = await ruf(app, "aas_pruefen", {
      environment: JSON.stringify(MIT_ANHANG),
      anhaenge: null,
    });
    expect(daten["verstoesse"]).toBe(0);
    expect(daten["warnungen"] as number).toBeGreaterThan(0);
  });

  it("zaehlt das defaultThumbnail als Nutzer seines Anhangs", async () => {
    const { daten } = await ruf(app, "aas_pruefen", {
      environment: JSON.stringify(MIT_ANHANG),
      anhaenge: ["/aasx/files/datenblatt.pdf", "/aasx/files/vorschau.png"],
    });
    const bilanz = daten["anhaenge"] as Record<string, unknown>;
    expect(bilanz["unreferenziert"]).toEqual([]);
    expect(daten["warnungen"]).toBe(0);
  });
});

// --- Rundlauf -------------------------------------------------------------------------

describe("aas_datei_lesen erhaelt die Anhaenge", () => {
  it("gibt je Anhang einen Token zurueck, der wieder als Quelle taugt", async () => {
    const erzeugt = await ruf(app, "aas_datei_erzeugen", {
      environment: JSON.stringify(MIT_ANHANG),
      format: "aasx",
      dateiname: "runde",
      anhaenge: [
        anhang("/aasx/files/datenblatt.pdf", "application/pdf", { base64: PDF_BASE64 }),
        anhang("/aasx/files/vorschau.png", "image/png", { base64: PNG_BASE64 }),
      ],
    });
    const download = await app.inject({
      method: "GET",
      url: new URL(String(erzeugt.daten["url"])).pathname,
    });

    /*
     * `aas_datei_lesen` nimmt eine Datei nur als https-Adresse oder als Text entgegen,
     * ein AASX ist beides nicht. Der Weg fuer Binaerdaten ist derselbe wie beim Bauen:
     * hochladen, Token nennen. Deshalb laeuft der Rundlauf hier ueber den Upload.
     */
    const upload = await app.inject({
      method: "POST",
      url: "/api/mcp/anhaenge",
      ...multipart("runde.aasx", "application/zip", Buffer.from(download.rawPayload)),
    });
    expect(upload.statusCode).toBe(201);
    const { token } = upload.json() as { token: string };

    // Und der Beweis, dass der Rundlauf wirklich schliesst: derselbe Container laesst
    // sich ueber seinen Token als Anhang in einen neuen Container legen.
    const wieder = await ruf(app, "aas_datei_erzeugen", {
      environment: JSON.stringify({
        submodels: [
          {
            modelType: "Submodel",
            id: "urn:test:sm:huelle",
            submodelElements: [
              {
                modelType: "File",
                idShort: "Paket",
                contentType: "application/zip",
                value: "/aasx/files/runde.aasx",
              },
            ],
          },
        ],
      }),
      format: "aasx",
      dateiname: null,
      anhaenge: [anhang("/aasx/files/runde.aasx", null, { token })],
    });
    expect(wieder.istFehler).toBe(false);
    expect((wieder.daten["anhaenge"] as Record<string, unknown>)["fehlend"]).toEqual([]);
  });

  it("liefert fuer eine JSON-Quelle eine leere Anhangsliste statt gar keiner", async () => {
    const { daten } = await ruf(app, "aas_datei_lesen", {
      inhalt: JSON.stringify(GUELTIG),
      url: null,
      dateiname: "geraet.json",
    });
    expect(daten["anhaenge"]).toEqual([]);
  });
});

// --- Zaun gegen das interne Netz ------------------------------------------------------

/*
 * Kein Test greift hier ins Netz. Was geprueft wird, ist der Zaun **vor** dem
 * Verbindungsaufbau, und der ist bei jeder Weiterleitung derselbe Aufruf: es genuegt
 * also, ihn einmal je Art von Ziel zu treffen.
 */
describe("Zaun gegen das interne Netz", () => {
  const faelle: readonly (readonly [string, string])[] = [
    ["http statt https", "http://example.com/a.pdf"],
    ["Loopback als IP", "https://127.0.0.1/a.pdf"],
    ["Loopback als Name", "https://localhost/a.pdf"],
    ["Metadatendienst", "https://169.254.169.254/latest/meta-data/"],
    ["privates Netz", "https://192.168.1.1/a.pdf"],
    ["Docker-Netz", "https://172.17.0.1/a.pdf"],
    ["IPv6-Loopback", "https://[::1]/a.pdf"],
    ["IPv4 im IPv6-Kleid", "https://[::ffff:169.254.169.254]/a.pdf"],
  ];

  for (const [name, url] of faelle) {
    it(`lehnt ab: ${name}`, async () => {
      const { istFehler, daten } = await ruf(app, "aas_datei_lesen", {
        url,
        inhalt: null,
        dateiname: null,
      });
      expect(istFehler, `${url} kam durch`).toBe(true);
      expect(String(daten["fehler"])).toMatch(/https|internen Bereich/);
    });
  }

  it("lehnt dieselben Ziele auch als Anhangsquelle ab", async () => {
    const { istFehler, daten } = await ruf(app, "aas_datei_erzeugen", {
      environment: JSON.stringify(GUELTIG),
      format: "aasx",
      dateiname: null,
      anhaenge: [
        anhang("/a.pdf", "application/pdf", { url: "https://169.254.169.254/latest/meta-data/" }),
      ],
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("internen Bereich");
  });
});
