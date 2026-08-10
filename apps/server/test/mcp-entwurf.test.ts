import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { startTestServer, type TestServer } from "./helpers/app.js";
import { anhang, GUELTIG, PNG_BASE64, ruf } from "./helpers/mcp.js";

/**
 * Entwuerfe: das Environment bleibt auf dem Server.
 *
 * Der Anlass steht in der Projektakte. Aus einer echten Sitzung gemeldet: 34 KB
 * Environment, einmal an `aas_pruefen` und einmal an `aas_datei_erzeugen`, und jede
 * Korrektur kostete zwei weitere Vollduebertragungen. Das war der groesste Posten des
 * ganzen Ablaufs, und er entstand nur, weil der Server nichts behielt.
 *
 * Geprueft wird ueber das Protokoll, nicht an den Funktionen: ein Werkzeug, das fuer sich
 * richtig rechnet, aber nicht angemeldet ist, hilft im Chat niemandem.
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

/** Legt einen Entwurf an und gibt seine Kennung zurueck. */
async function neuerEntwurf(environment: unknown = GUELTIG): Promise<string> {
  const { istFehler, daten } = await ruf(app, "entwurf_anlegen", {
    environment: JSON.stringify(environment),
  });
  expect(istFehler, JSON.stringify(daten)).toBe(false);
  return String(daten["entwurf"]);
}

describe("entwurf_anlegen", () => {
  it("gibt eine Kennung zurueck und prueft im selben Aufruf", async () => {
    const { daten } = await ruf(app, "entwurf_anlegen", {
      environment: JSON.stringify(GUELTIG),
    });
    expect(String(daten["entwurf"])).toHaveLength(43);
    expect(daten["verstoesse"]).toBe(0);
    expect(daten["urteil"]).toBeTruthy();
    // Die Anhangsbilanz kommt mit, sonst muesste man dafuer noch einmal pruefen.
    expect(daten["anhaenge"]).toBeDefined();
  });

  it("legt den normalisierten Stand ab, nicht den eingeschickten", async () => {
    // Sonst kaeme der Verstoss ueber die leere Liste bei jedem Patch aufs Neue.
    const entwurf = await neuerEntwurf({ ...GUELTIG, conceptDescriptions: [] });
    const { daten } = await ruf(app, "entwurf_lesen", { entwurf });
    const env = daten["environment"] as Record<string, unknown>;
    expect(env["conceptDescriptions"]).toBeUndefined();
  });
});

describe("entwurf_aendern", () => {
  it("setzt einen Wert und prueft danach, in einem Aufruf", async () => {
    const entwurf = await neuerEntwurf();
    const { istFehler, daten } = await ruf(app, "entwurf_aendern", {
      entwurf,
      patches: [
        { op: "setzen", pfad: "/submodels/0/submodelElements/0/value", wert: "Pepperl+Fuchs" },
      ],
    });
    expect(istFehler).toBe(false);
    expect(daten["angewandt"]).toBe(1);
    expect(daten["verstoesse"]).toBe(0);

    const nachher = await ruf(app, "entwurf_lesen", {
      entwurf,
      pfad: "/submodels/0/submodelElements/0/value",
    });
    expect(nachher.daten["wert"]).toBe("Pepperl+Fuchs");
  });

  it("wendet mehrere Patches der Reihe nach an", async () => {
    const entwurf = await neuerEntwurf();
    const { daten } = await ruf(app, "entwurf_aendern", {
      entwurf,
      patches: [
        {
          op: "anfuegen",
          pfad: "/submodels/0/submodelElements/-",
          wert: {
            modelType: "Property",
            idShort: "Seriennummer",
            valueType: "xs:string",
            value: "1",
          },
        },
        { op: "setzen", pfad: "/submodels/0/submodelElements/1/value", wert: "TS-100-0001" },
      ],
    });
    expect(daten["angewandt"]).toBe(2);

    const { daten: gelesen } = await ruf(app, "entwurf_lesen", {
      entwurf,
      pfad: "/submodels/0/submodelElements/1",
    });
    expect((gelesen["wert"] as Record<string, unknown>)["value"]).toBe("TS-100-0001");
  });

  it("entfernt ein Element aus einer Liste", async () => {
    const entwurf = await neuerEntwurf();
    await ruf(app, "entwurf_aendern", {
      entwurf,
      patches: [{ op: "entfernen", pfad: "/submodels/0/submodelElements/0" }],
    });
    const { daten } = await ruf(app, "entwurf_lesen", {
      entwurf,
      pfad: "/submodels/0/submodelElements",
    });
    expect(daten["wert"]).toEqual([]);
  });

  /*
   * Alles oder nichts. Ein halb angewandter Stapel waere schlimmer als ein abgelehnter:
   * der Aufrufer wuesste danach nicht mehr, was im Entwurf steht.
   */
  it("laesst den Entwurf unveraendert, wenn ein Patch mittendrin scheitert", async () => {
    const entwurf = await neuerEntwurf();
    const { istFehler, daten } = await ruf(app, "entwurf_aendern", {
      entwurf,
      patches: [
        { op: "setzen", pfad: "/submodels/0/idShort", wert: "Geaendert" },
        { op: "setzen", pfad: "/submodels/9/idShort", wert: "Gibtsnicht" },
      ],
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("Patch 2 von 2");

    const { daten: gelesen } = await ruf(app, "entwurf_lesen", { entwurf, pfad: "/submodels/0/idShort" });
    expect(gelesen["wert"]).toBe("Typenschild");
  });

  it("meldet einen Verstoss, ohne die Aenderung zurueckzunehmen", async () => {
    // Die Pruefung ist ein Rueckkanal, keine Sperre: ein Zwischenstand mit Befunden ist
    // ein gueltiger Arbeitsstand.
    const entwurf = await neuerEntwurf();
    const { istFehler, daten } = await ruf(app, "entwurf_aendern", {
      entwurf,
      patches: [{ op: "setzen", pfad: "/submodels/0/submodelElements/0/idShort", wert: "" }],
    });
    expect(istFehler).toBe(false);
    expect(daten["verstoesse"] as number).toBeGreaterThan(0);
  });

  it("verlangt mindestens einen Patch", async () => {
    const entwurf = await neuerEntwurf();
    const { istFehler, daten } = await ruf(app, "entwurf_aendern", { entwurf, patches: [] });
    expect(istFehler).toBe(true);
    expect(String(daten["hinweis"])).toContain("entwurf_lesen");
  });

  it("unterscheidet einen erfundenen Entwurf nicht von einem abgelaufenen", async () => {
    // Wie beim Download-Token: ein eigener Code fuer „gab es mal" verriete, dass die
    // Kennung echt war.
    const { istFehler, daten } = await ruf(app, "entwurf_aendern", {
      entwurf: "a".repeat(43),
      patches: [{ op: "setzen", pfad: "/x", wert: 1 }],
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("unbekannt oder abgelaufen");
  });

  it("weist eine verunstaltete Kennung ab, statt sie an einen Pfad zu haengen", async () => {
    const { istFehler } = await ruf(app, "entwurf_lesen", { entwurf: "../../aas-editor.db" });
    expect(istFehler).toBe(true);
  });
});

describe("entwurf als Quelle", () => {
  it("wird von aas_pruefen angenommen", async () => {
    const entwurf = await neuerEntwurf();
    const { istFehler, daten } = await ruf(app, "aas_pruefen", { entwurf });
    expect(istFehler).toBe(false);
    expect(daten["verstoesse"]).toBe(0);
  });

  it("wird von aas_datei_erzeugen angenommen, samt Anhaengen", async () => {
    const entwurf = await neuerEntwurf({
      assetAdministrationShells: [
        {
          modelType: "AssetAdministrationShell",
          id: "urn:test:aas:entwurf",
          idShort: "Geraet",
          assetInformation: {
            assetKind: "Instance",
            globalAssetId: "urn:test:asset:entwurf",
            defaultThumbnail: { path: "/aasx/suppl/bild.png", contentType: "image/png" },
          },
        },
      ],
    });

    const { istFehler, daten } = await ruf(app, "aas_datei_erzeugen", {
      entwurf,
      format: "aasx",
      dateiname: "aus-entwurf",
      anhaenge: [anhang("/aasx/suppl/bild.png", "image/png", { base64: PNG_BASE64 })],
    });
    expect(istFehler, JSON.stringify(daten)).toBe(false);
    expect(String(daten["url"])).toContain("/api/mcp/dateien/");
    expect(daten["dateiname"]).toBe("aus-entwurf.aasx");
  });

  it("lehnt environment und entwurf zusammen ab", async () => {
    const entwurf = await neuerEntwurf();
    const { istFehler, daten } = await ruf(app, "aas_pruefen", {
      entwurf,
      environment: JSON.stringify(GUELTIG),
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("schliessen sich aus");
  });

  it("lehnt einen Aufruf ohne beides ab", async () => {
    const { istFehler, daten } = await ruf(app, "aas_pruefen", {});
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("Quelle");
  });
});

describe("anhang_hochladen", () => {
  it("gibt einen Token, der unveraendert als Quelle taugt", async () => {
    const hoch = await ruf(app, "anhang_hochladen", {
      base64: PNG_BASE64,
      dateiname: "bild.png",
      contentType: "image/png",
    });
    expect(hoch.istFehler).toBe(false);
    const token = String(hoch.daten["token"]);
    expect(token).toHaveLength(43);

    const entwurf = await neuerEntwurf();
    const { istFehler, daten } = await ruf(app, "aas_datei_erzeugen", {
      entwurf,
      format: "aasx",
      anhaenge: [anhang("/aasx/suppl/bild.png", null, { token })],
    });
    expect(istFehler, JSON.stringify(daten)).toBe(false);
    const bilanz = daten["anhaenge"] as Record<string, unknown>;
    expect(bilanz["geschrieben"]).toEqual(["/aasx/suppl/bild.png"]);
  });

  it("nimmt den contentType nicht aus dem Dateinamen, sondern aus der Angabe", async () => {
    const { istFehler, daten } = await ruf(app, "anhang_hochladen", {
      base64: PNG_BASE64,
      dateiname: "harmlos.png",
      contentType: "application/x-msdownload",
    });
    expect(istFehler).toBe(true);
    expect(String(daten["fehler"])).toContain("nicht zugelassen");
  });

  it("lehnt leeres base64 ab", async () => {
    const { istFehler } = await ruf(app, "anhang_hochladen", {
      base64: "",
      contentType: "image/png",
    });
    expect(istFehler).toBe(true);
  });
});

describe("aas_datei_lesen", () => {
  it("legt gleich einen Entwurf an, statt das Environment zurueckzuverlangen", async () => {
    const erzeugt = await ruf(app, "aas_datei_erzeugen", {
      environment: JSON.stringify(GUELTIG),
      format: "json",
    });
    const url = String(erzeugt.daten["url"]);
    const datei = await app.inject({ method: "GET", url: new URL(url).pathname });

    const gelesen = await ruf(app, "aas_datei_lesen", {
      inhalt: datei.payload,
      dateiname: "runde.json",
    });
    expect(gelesen.istFehler).toBe(false);
    const entwurf = String(gelesen.daten["entwurf"]);
    expect(entwurf).toHaveLength(43);

    // Und er laesst sich ohne weiteres Zutun weiterverwenden.
    const { daten } = await ruf(app, "aas_pruefen", { entwurf });
    expect(daten["verstoesse"]).toBe(0);
  });
});
