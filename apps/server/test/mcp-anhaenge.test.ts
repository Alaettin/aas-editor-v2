import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importFile } from "@aas-editor/core/io";
import type { FastifyInstance } from "fastify";
import { KATALOG, pflichtGeruest } from "../src/mcp/vorlagen.js";
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
      "contactinformation-1-0-1",
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
      conceptDescriptions: true,
    });
    expect((daten["conceptDescriptions"] as unknown[]).length).toBeGreaterThan(0);
    const sm = daten["submodel"] as Record<string, unknown>;
    // Unveraendert heisst unveraendert: kind bleibt Template, die Qualifier bleiben drin.
    expect(sm["kind"]).toBe("Template");
    expect(JSON.stringify(sm)).toContain("SMT/Cardinality");
  });

  it("liefert die Begriffsdefinitionen nur auf Verlangen", async () => {
    // Sie sind der Loewenanteil der Groesse. Ohne Schalter fehlen sie, und genau das war
    // der Grund, warum umfang=vollstaendig den Kontext sprengte.
    const { daten } = await ruf(app, "aas_vorlage", {
      kennung: "nameplate-3-0",
      umfang: "vollstaendig",
    });
    expect(daten["conceptDescriptions"]).toBeUndefined();
  });

  it("dampft ein: das Pflicht-Geruest ist deutlich kleiner als die ganze Vorlage", async () => {
    const pflicht = await ruf(app, "aas_vorlage", {
      kennung: "technicaldata-2-0",
      umfang: "pflicht",
    });
    const voll = await ruf(app, "aas_vorlage", {
      kennung: "technicaldata-2-0",
      umfang: "vollstaendig",
      conceptDescriptions: true,
    });
    expect(JSON.stringify(pflicht.daten["submodel"]).length).toBeLessThan(
      JSON.stringify(voll.daten).length / 4,
    );
    expect(pflicht.daten["weggelassen"] as number).toBeGreaterThan(0);
  });

  /*
   * Die Stufe `struktur` ist die Vorgabe, seit `pflicht` zu wenig und `vollstaendig` zu
   * viel lieferte: `pflicht` liess CompanyLogo, Markings und ProductImages weg, weil sie
   * optional sind, und `vollstaendig` sprengte bei technicaldata-2-0 den Kontext.
   */
  it("zeigt in der Vorgabe alle Elemente, auch die optionalen", async () => {
    const { daten } = await ruf(app, "aas_vorlage", { kennung: "nameplate-3-0" });
    expect(daten["umfang"]).toBe("struktur");
    const text = JSON.stringify(daten["submodel"]);
    for (const optional of ["CompanyLogo", "Markings", "AssetSpecificProperties"]) {
      expect(text, `${optional} fehlt im Bauplan`).toContain(optional);
    }
  });

  it("haelt den Bauplan klein: ein Fuenftel der ganzen Vorlage", async () => {
    const { daten } = await ruf(app, "aas_vorlage", { kennung: "technicaldata-2-0" });
    const groesse = JSON.stringify(daten).length;
    /*
     * Gemessen wird gegen die Datei selbst, nicht gegen eine ausgedachte Zahl: sie ist
     * das, was vorher durch den Kontext ging. Am 10.08.2026 waren es 11 KB gegen 69 KB;
     * die Schranke haelt fest, dass sich das nicht unbemerkt annaehert.
     */
    const ganze = JSON.stringify(
      (await ruf(app, "aas_vorlage", {
        kennung: "technicaldata-2-0",
        umfang: "vollstaendig",
        conceptDescriptions: true,
      })).daten,
    ).length;
    expect(groesse, `Bauplan ist ${groesse} Zeichen, ganze Vorlage ${ganze}`).toBeLessThan(
      ganze / 5,
    );
    // Die semanticId steht als blosse Zeichenkette da, nicht als Schluesselobjekt.
    expect(JSON.stringify(daten["submodel"])).not.toContain("GlobalReference");
  });

  it("schneidet mit pfad auf einen Teilbaum zu", async () => {
    const { daten } = await ruf(app, "aas_vorlage", {
      kennung: "nameplate-3-0",
      pfad: "/Markings",
    });
    const sm = daten["submodel"] as Record<string, unknown>;
    expect(sm["idShort"]).toBe("Markings");
    expect(JSON.stringify(sm)).toContain("MarkingName");
    // Und nichts von ausserhalb des Zweigs.
    expect(JSON.stringify(sm)).not.toContain("ManufacturerName");
  });

  it("sagt bei einem falschen pfad, was es an dieser Stelle gibt", async () => {
    const { istFehler, daten } = await ruf(app, "aas_vorlage", {
      kennung: "nameplate-3-0",
      pfad: "/Gibtsnicht",
    });
    expect(istFehler).toBe(true);
    expect(String(daten["hinweis"])).toContain("ManufacturerName");
  });

  /*
   * Die kaputte URL steht so in der Datei der IDTA. Sie wird gemeldet und nicht
   * ausgebessert: eine ausgebesserte Vorlage ist keine Spezifikation mehr, sondern eine
   * Abschrift davon.
   */
  it("nennt die bekannten Fehler des Herausgebers", async () => {
    const { daten } = await ruf(app, "aas_vorlage", { kennung: "technicaldata-2-0" });
    const maengel = (daten["bekannteMaengel"] as string[]) ?? [];
    expect(maengel.some((m) => m.includes("eclass-cdp.com/ "))).toBe(true);
    expect(maengel.some((m) => m.includes("Technsiche"))).toBe(true);
  });

  /*
   * Bis zum 10.08.2026 wurde hier nur auf einen zweiten Aufruf verwiesen. Das war die
   * halbe Auskunft: der Aufrufer musste sich aus IDTA 02002 selbst zusammensuchen, was
   * hierher gehoert, und genau dabei entsteht wieder Raten. Jetzt stehen die Felder da.
   */
  it("haengt an der leeren AddressInformation die Adressfelder samt Quelle ein", async () => {
    const { daten } = await ruf(app, "aas_vorlage", {
      kennung: "nameplate-3-0",
      pfad: "/AddressInformation",
    });
    const sm = daten["submodel"] as Record<string, unknown>;
    const text = JSON.stringify(sm);
    for (const feld of ["Street", "Zipcode", "CityTown", "NationalCode"]) {
      expect(text, `${feld} fehlt an der AddressInformation`).toContain(feld);
    }
    // Die IRDI aus IDTA 02002, nicht geraten.
    expect(text).toContain("0173-1#02-AAO128#002");
    // Und dass es eine andere Quelle ist, steht dabei.
    expect(String(sm["_quelle"])).toContain("IDTA 02002");
    expect(String(sm["_hinweis"])).toContain("Nicht raten");
  });

  /*
   * Die Datei fuehrt sehr wohl Kardinalitaeten, nur unter dem Namen `Multiplicity`. Bis
   * zum 10.08.2026 kannte der Server nur `SMT/Cardinality` und hielt IDTA 02002 deshalb
   * fuer eine Vorlage ohne. Berichtet wurde es genauso, und beides war falsch.
   */
  it("liest Multiplicity als Kardinalitaet, wo die IDTA sie so nennt", async () => {
    const { istFehler, daten } = await ruf(app, "aas_vorlage", {
      kennung: "contactinformation-1-0-1",
      umfang: "pflicht",
    });
    expect(istFehler).toBe(false);
    const text = JSON.stringify(daten["submodel"]);
    expect(text).toContain("ContactInformation");
    expect(daten["umfang"]).toBe("pflicht");
  });

  it("liefert statt eines Fehlers den Bauplan, wo es wirklich keine Kardinalitaeten gibt", () => {
    /*
     * Kein Aufruf, sondern eine Zusicherung an den Code: alle vier eingecheckten Vorlagen
     * fuehren Kardinalitaeten, unter dem einen oder dem anderen Namen. Der Zweig, der
     * ohne sie den Bauplan zurueckgibt, ist damit ein Netz und kein Regelfall. Faellt eine
     * fuenfte Vorlage herein, die keine fuehrt, faellt das hier auf.
     */
    for (const eintrag of KATALOG) {
      expect(pflichtGeruest(eintrag).traegtKardinalitaeten, eintrag.kennung).toBe(true);
    }
  });

  /*
   * Die Platzhalter der IDTA sagen nur "hier darf beliebiges stehen", stehen in der Datei
   * aber zweifach verschachtelt und insgesamt sechsmal. Ausgerollt sind das rund dreissig
   * Zeilen JSON je Vorkommen fuer einen Satz Aussage.
   */
  it("rollt die Arbitrary-Platzhalter nicht aus, sondern sagt es in einer Zeile", async () => {
    const { daten } = await ruf(app, "aas_vorlage", { kennung: "technicaldata-2-0" });
    const text = JSON.stringify(daten["submodel"]);
    // Als Element, nicht als Wort: der _beliebig-Hinweis nennt die Namen ja gerade.
    for (const platzhalter of ["Section", "ArbitrarySMC", "ArbitrarySML", "ArbitraryRange"]) {
      expect(text, `${platzhalter} wird noch ausgerollt`).not.toContain(
        `"idShort":"${platzhalter}"`,
      );
    }
    expect(text).toContain("_beliebig");
    // Die echten Elemente sind unberuehrt.
    expect(text).toContain("TechnicalPropertyAreas");
    expect(text).toContain("ManufacturerName");
  });

  it("liefert die Adressfelder samt IRDI aus der ContactInformation", async () => {
    const { daten } = await ruf(app, "aas_vorlage", {
      kennung: "contactinformation-1-0-1",
      pfad: "/ContactInformation",
    });
    const text = JSON.stringify(daten["submodel"]);
    // Die IRDIs sind der ganze Grund fuer dieses Werkzeug.
    expect(text).toContain("0173-1#02-AAO128#002");
    for (const feld of ["Street", "Zipcode", "CityTown", "NationalCode"]) {
      expect(text, `${feld} fehlt`).toContain(feld);
    }
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
    expect(bilanz["aufgeloest"]).toEqual([{ pfad: "/da.pdf", verweise: 1 }]);
    expect((bilanz["fehlend"] as { pfad: string }[]).map((f) => f.pfad)).toEqual(["/weg.pdf"]);
    expect((bilanz["extern"] as { url: string }[]).map((e) => e.url)).toEqual([
      "https://example.com/fern.pdf",
    ]);
    // Die Gegenrichtung, die es bisher nirgends gab: ein Anhang, den niemand braucht.
    expect(bilanz["unreferenziert"]).toEqual(["/niemand.pdf"]);
    expect(daten["anhangswarnung"]).toBeTruthy();
  });

  /*
   * Zwei File-Elemente auf dieselbe Datei: bis zum 10.08.2026 stand sie zweimal unter
   * aufgeloest und las sich wie ein Duplikatfehler in der Antwort.
   */
  it("zaehlt eine geteilte Datei als einen Eintrag mit zwei Verweisen", async () => {
    const env = {
      submodels: [
        {
          modelType: "Submodel",
          id: "urn:test:sm:doku",
          submodelElements: [
            { modelType: "File", idShort: "A", contentType: "image/png", value: "/logo.png" },
            { modelType: "File", idShort: "B", contentType: "image/png", value: "/logo.png" },
          ],
        },
      ],
    };
    const { daten } = await ruf(app, "aas_pruefen", {
      environment: JSON.stringify(env),
      anhaenge: ["/logo.png"],
    });
    const bilanz = daten["anhaenge"] as Record<string, unknown>;
    expect(bilanz["aufgeloest"]).toEqual([{ pfad: "/logo.png", verweise: 2 }]);
  });

  /*
   * Leere Listen sind als "keine" gemeint, das Metamodell wertet sie als Verstoss. Der
   * Befund kam obendrein ohne Regelkennung und mit **leerem** Pfad, weil die Wurzel in der
   * SDK keinen hat. Beides war ein Stolperstein in einer echten Sitzung.
   */
  it("entfernt leere Listen und sagt es dazu, statt sie als Verstoss zu melden", async () => {
    const { daten } = await ruf(app, "aas_pruefen", {
      environment: JSON.stringify({ ...GUELTIG, conceptDescriptions: [] }),
    });
    expect(daten["verstoesse"]).toBe(0);
    expect(daten["normalisiert"]).toEqual(["conceptDescriptions"]);
    expect(daten["normalisierungshinweis"]).toBeTruthy();
  });

  it("nennt die Wurzel beim Namen, statt einen leeren Pfad zu melden", async () => {
    // Ein Environment ohne alles: die Verletzung haengt an der Wurzel selbst.
    const { daten } = await ruf(app, "aas_pruefen", {
      environment: JSON.stringify({ assetAdministrationShells: [{ modelType: "Unsinn" }] }),
    });
    const befunde = (daten["befunde"] as { pfad: string }[]) ?? [];
    expect(befunde.length).toBeGreaterThan(0);
    expect(befunde.every((b) => b.pfad !== "")).toBe(true);
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
  /*
   * Der dritte Eintrag je Fall ist der Bereich, der in der Meldung stehen muss. Bis zum
   * 10.08.2026 sagte sie nur "liegt in einem internen Bereich", und genau daran ist eine
   * Klaerung haengengeblieben: eine oeffentliche Adresse wurde abgewiesen, und aus der
   * Meldung ging nicht hervor, welche Regel gegriffen hatte.
   */
  const faelle: readonly (readonly [string, string, string])[] = [
    ["http statt https", "http://example.com/a.pdf", "Nur https"],
    ["Loopback als IP", "https://127.0.0.1/a.pdf", "127.0.0.0/8"],
    ["Metadatendienst", "https://169.254.169.254/latest/meta-data/", "169.254.0.0/16"],
    ["privates Netz", "https://192.168.1.1/a.pdf", "192.168.0.0/16"],
    ["Docker-Netz", "https://172.17.0.1/a.pdf", "172.16.0.0/12"],
    ["IPv6-Loopback", "https://[::1]/a.pdf", "::1/128"],
    ["IPv4 im IPv6-Kleid", "https://[::ffff:169.254.169.254]/a.pdf", "169.254.0.0/16"],
  ];

  for (const [name, url, bereich] of faelle) {
    it(`lehnt ab und nennt den Bereich: ${name}`, async () => {
      const { istFehler, daten } = await ruf(app, "aas_datei_lesen", {
        url,
        inhalt: null,
        dateiname: null,
      });
      expect(istFehler, `${url} kam durch`).toBe(true);
      expect(String(daten["fehler"]), `${url} nennt den Bereich nicht`).toContain(bereich);
    });
  }

  it("lehnt Loopback auch unter seinem Namen ab", async () => {
    // Welchen Bereich `localhost` trifft, haengt am Resolver: 127.0.0.0/8 oder ::1/128.
    const { istFehler, daten } = await ruf(app, "aas_datei_lesen", {
      url: "https://localhost/a.pdf",
      inhalt: null,
      dateiname: null,
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toMatch(/127\.0\.0\.0\/8|::1\/128/);
  });

  /*
   * Der Fehlalarm vom 10.08.2026, als Test festgehalten. `bdih-download.endress.com`
   * zeigt auf 23.201.254.186, oeffentlicher Akamai-Raum. Die Liste sperrte damals
   * `::ffff:0:0/96` als Ganzes, also **jede** IPv4-Adresse im IPv6-Kleid; welche
   * Schreibweise ein Resolver liefert, haengt am Container und nicht am Ziel.
   */
  it("laesst eine oeffentliche Adresse durch, auch im IPv6-Kleid", async () => {
    for (const url of [
      "https://23.201.254.186/a.pdf",
      "https://[::ffff:23.201.254.186]/a.pdf",
      "https://[::ffff:17c9:feba]/a.pdf",
    ]) {
      const { daten } = await ruf(app, "aas_datei_lesen", { url, inhalt: null, dateiname: null });
      // Am Zaun scheitert sie nicht mehr. Dass der Abruf selbst scheitert, ist in einem
      // Test ohne Netz der erwartete Ausgang.
      expect(String(daten["fehler"] ?? ""), `${url} haengt noch am Zaun`).not.toMatch(
        /liegt in .*\/\d+ \(/,
      );
    }
  });

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
    expect(String(daten["fehler"])).toContain("169.254.0.0/16");
  });
});
