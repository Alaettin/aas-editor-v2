import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { startTestServer, type TestServer } from "./helpers/app.js";
import { anhang, GUELTIG, multipart, PDF_ABGESCHNITTEN, PDF_BYTES, PNG_BASE64, ruf } from "./helpers/mcp.js";

/**
 * Bytes annehmen oder ablehnen, aber nie stillschweigend verstuemmeln.
 *
 * Der Anlass steht im Feldbericht vom 10.08.2026: `anhang_hochladen` hat **zweimal**
 * halbe Bilder angenommen und dafuer einen Token samt Erfolgsmeldung zurueckgegeben.
 * Aufgefallen ist es allein deshalb, weil der Aufrufer die Groesse der Quelldatei im Kopf
 * hatte. Ursache war `Buffer.from(text, "base64")`, das am ersten ungueltigen Zeichen still
 * aufhoert zu dekodieren.
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

const PNG_BYTES = Buffer.from(PNG_BASE64, "base64");
const sha = (b: Buffer | Uint8Array): string => createHash("sha256").update(b).digest("hex");

describe("anhang_hochladen prueft die Bytes", () => {
  it("nimmt eine vollstaendige Datei und nennt ihre Pruefsumme", async () => {
    const { istFehler, daten } = await ruf(app, "anhang_hochladen", {
      base64: PNG_BASE64,
      contentType: "image/png",
      dateiname: "bild.png",
    });
    expect(istFehler).toBe(false);
    expect(daten["groesse"]).toBe(PNG_BYTES.byteLength);
    // Immer mitgeliefert, auch ohne Zusage: sonst ist ein Abgleich gar nicht moeglich.
    expect(daten["sha256"]).toBe(sha(PNG_BYTES));
  });

  it("lehnt base64 ab, das mitten im Alphabet abbricht, statt es abzuschneiden", async () => {
    // Genau das kam frueher als Token mit Erfolgsmeldung zurueck.
    const kaputt = `${PNG_BASE64.slice(0, 40)}%%%${PNG_BASE64.slice(43)}`;
    const { istFehler, daten } = await ruf(app, "anhang_hochladen", {
      base64: kaputt,
      contentType: "image/png",
      dateiname: "bild.png",
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("ungueltige Zeichen");
    expect(String(daten["fehler"])).toContain("Stelle 40");
  });

  it("lehnt einen angefangenen Viererblock ab", async () => {
    const { istFehler, daten } = await ruf(app, "anhang_hochladen", {
      base64: PNG_BASE64.slice(0, PNG_BASE64.length - 3),
      contentType: "image/png",
      dateiname: "bild.png",
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("durch vier teilbar");
  });

  /*
   * Der Fall aus dem Feldbericht in seiner reinen Form: das base64 ist tadellos, die Datei
   * dahinter ist es nicht. Beim JPEG haette schon der fehlende EOI-Marker gereicht.
   */
  it("lehnt eine abgeschnittene Datei ab, auch wenn das base64 stimmt", async () => {
    const { istFehler, daten } = await ruf(app, "anhang_hochladen", {
      base64: PDF_ABGESCHNITTEN.toString("base64"),
      contentType: "application/pdf",
      dateiname: "datenblatt.pdf",
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("bricht ab");
    expect(String(daten["fehler"])).toContain("%%EOF");
  });

  it("lehnt ein abgeschnittenes JPEG am fehlenden EOI-Marker ab", async () => {
    // Ein JPEG-Kopf ohne sein FF D9 am Ende.
    const halb = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 0x41)]);
    const { istFehler, daten } = await ruf(app, "anhang_hochladen", {
      base64: halb.toString("base64"),
      contentType: "image/jpeg",
      dateiname: "produkt.jpg",
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("EOI-Marker");
  });

  it("lehnt ab, wenn der contentType nicht zu den Bytes passt, und sagt was es ist", async () => {
    const { istFehler, daten } = await ruf(app, "anhang_hochladen", {
      base64: PNG_BASE64,
      contentType: "application/pdf",
      dateiname: "angeblich.pdf",
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("PNG");
  });

  it("prueft eine zugesagte Groesse und nennt beide Zahlen", async () => {
    const { istFehler, daten } = await ruf(app, "anhang_hochladen", {
      base64: PNG_BASE64,
      contentType: "image/png",
      dateiname: "bild.png",
      groesse: PNG_BYTES.byteLength + 1000,
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain(String(PNG_BYTES.byteLength + 1000));
    expect(String(daten["fehler"])).toContain(String(PNG_BYTES.byteLength));
    expect(String(daten["hinweis"])).toContain("abgeschnitten");
  });

  it("prueft eine zugesagte Pruefsumme", async () => {
    const falsch = "0".repeat(64);
    const { istFehler, daten } = await ruf(app, "anhang_hochladen", {
      base64: PNG_BASE64,
      contentType: "image/png",
      dateiname: "bild.png",
      sha256: falsch,
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("sha256 stimmt nicht");
    expect(String(daten["hinweis"])).toContain(sha(PNG_BYTES));
  });

  it("laesst eine stimmige Pruefsumme durch", async () => {
    const { istFehler } = await ruf(app, "anhang_hochladen", {
      base64: PNG_BASE64,
      contentType: "image/png",
      dateiname: "bild.png",
      sha256: sha(PNG_BYTES),
      groesse: PNG_BYTES.byteLength,
    });
    expect(istFehler).toBe(false);
  });
});

describe("stueckweiser Upload", () => {
  /** Das PNG in drei Teile, an Viererblockgrenzen des base64 unabhaengig geschnitten. */
  const teile = [PNG_BYTES.subarray(0, 30), PNG_BYTES.subarray(30, 60), PNG_BYTES.subarray(60)];

  it("setzt drei Teile zu Byte-fuer-Byte demselben Ergebnis zusammen", async () => {
    const erster = await ruf(app, "anhang_hochladen", {
      base64: teile[0]!.toString("base64"),
      contentType: "image/png",
      dateiname: "gross.png",
      teil: 1,
    });
    expect(erster.istFehler).toBe(false);
    expect(erster.daten["vollstaendig"]).toBe(false);
    const token = String(erster.daten["token"]);

    const zweiter = await ruf(app, "anhang_hochladen", {
      base64: teile[1]!.toString("base64"),
      token,
      teil: 2,
    });
    expect(zweiter.istFehler).toBe(false);

    const dritter = await ruf(app, "anhang_hochladen", {
      base64: teile[2]!.toString("base64"),
      token,
      teil: 3,
      letzter: true,
      sha256: sha(PNG_BYTES),
    });
    expect(dritter.istFehler).toBe(false);
    expect(dritter.daten["vollstaendig"]).toBe(true);
    expect(dritter.daten["groesse"]).toBe(PNG_BYTES.byteLength);
    expect(dritter.daten["sha256"]).toBe(sha(PNG_BYTES));

    // Und der Token taugt als Anhangsquelle wie jeder andere.
    const { istFehler } = await ruf(app, "aas_datei_erzeugen", {
      environment: JSON.stringify(GUELTIG),
      format: "aasx",
      dateiname: null,
      anhaenge: [anhang("/aasx/files/gross.png", "image/png", { token })],
    });
    expect(istFehler).toBe(false);
  });

  /*
   * Ein halb angewandter Stapel ist schlimmer als ein abgelehnter. Fuer Patches steht das
   * seit dem 10.08.2026 in der Akte; fuer Bytes gilt es genauso.
   */
  it("laesst den Upload bei einer falschen Folgenummer unveraendert", async () => {
    const erster = await ruf(app, "anhang_hochladen", {
      base64: teile[0]!.toString("base64"),
      contentType: "image/png",
      dateiname: "gross.png",
      teil: 1,
    });
    const token = String(erster.daten["token"]);

    const falsch = await ruf(app, "anhang_hochladen", {
      base64: teile[2]!.toString("base64"),
      token,
      teil: 5,
    });
    expect(falsch.istFehler).toBe(true);
    expect(String(falsch.daten["fehler"])).toContain("teil=2");
    expect(String(falsch.daten["hinweis"])).toContain("unveraendert");

    // Der richtige Teil geht danach ohne Umweg durch.
    const richtig = await ruf(app, "anhang_hochladen", {
      base64: teile[1]!.toString("base64"),
      token,
      teil: 2,
    });
    expect(richtig.istFehler).toBe(false);
    expect(richtig.daten["angekommen"]).toBe(teile[0]!.byteLength + teile[1]!.byteLength);
  });

  it("verwirft den ganzen Upload, wenn die Pruefsumme am Ende nicht stimmt", async () => {
    const erster = await ruf(app, "anhang_hochladen", {
      base64: teile[0]!.toString("base64"),
      contentType: "image/png",
      dateiname: "gross.png",
      teil: 1,
    });
    const token = String(erster.daten["token"]);

    const letzter = await ruf(app, "anhang_hochladen", {
      base64: teile[1]!.toString("base64"),
      token,
      teil: 2,
      letzter: true,
      sha256: sha(PNG_BYTES),
    });
    expect(letzter.istFehler).toBe(true);
    expect(String(letzter.daten["hinweis"])).toContain("verworfen");

    // Und der Token ist wirklich weg, nicht nur als fehlerhaft vermerkt.
    const danach = await ruf(app, "anhang_hochladen", {
      base64: teile[2]!.toString("base64"),
      token,
      teil: 3,
    });
    expect(danach.istFehler).toBe(true);
    expect(String(danach.daten["fehler"])).toContain("unbekannt oder abgelaufen");
  });

  /*
   * Ohne diese Sperre landet die halbe Datei im Container, und der Token sieht dabei aus
   * wie jeder andere.
   */
  it("laesst einen unvollstaendigen Token nicht als Anhangsquelle zu", async () => {
    const erster = await ruf(app, "anhang_hochladen", {
      base64: teile[0]!.toString("base64"),
      contentType: "image/png",
      dateiname: "gross.png",
      teil: 1,
    });
    const token = String(erster.daten["token"]);

    const { istFehler, daten } = await ruf(app, "aas_datei_erzeugen", {
      environment: JSON.stringify(GUELTIG),
      format: "aasx",
      dateiname: null,
      anhaenge: [anhang("/aasx/files/halb.png", "image/png", { token })],
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("nicht abgeschlossen");
  });
});

describe("der HTTP-Upload prueft dasselbe", () => {
  it("nimmt eine vollstaendige Datei und nennt die Pruefsumme", async () => {
    const antwort = await app.inject({
      method: "POST",
      url: "/api/mcp/anhaenge",
      ...multipart("datenblatt.pdf", "application/pdf", PDF_BYTES),
    });
    expect(antwort.statusCode).toBe(201);
    expect(antwort.json()["sha256"]).toBe(sha(PDF_BYTES));
  });

  it("lehnt eine abgeschnittene Datei ab", async () => {
    const antwort = await app.inject({
      method: "POST",
      url: "/api/mcp/anhaenge",
      ...multipart("datenblatt.pdf", "application/pdf", PDF_ABGESCHNITTEN),
    });
    expect(antwort.statusCode).toBe(400);
    expect(JSON.stringify(antwort.json())).toContain("bricht ab");
  });
});
