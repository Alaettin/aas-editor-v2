import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WERKZEUGE } from "@aas-editor/core/assistent";
import { einstellungen } from "../src/db/schema.js";
import { setzeAnbieter } from "../src/services/assistent.js";
import { entschluesseln, verschluesseln } from "../src/services/geheimnis.js";
import { startTestServer, type TestServer } from "./helpers/app.js";

/**
 * Der Assistent auf der Serverseite. Was hier geprueft wird, sind die drei Zusagen, die
 * nicht auffallen wuerden, wenn sie brechen: der Schluessel kommt nie zurueck, ohne
 * Schluessel gibt es einen uebersetzbaren Fehler statt eines abgerissenen Stroms, und die
 * Werkzeugschemata sind so gebaut, wie der strenge Modus der Responses-API es verlangt.
 */

const SCHLUESSEL = "sk-test-0000000000000000000000000000abcd";

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer();
});

afterEach(async () => {
  await server.close();
});

function mitCookie(method: "GET" | "PUT" | "DELETE" | "POST", url: string, payload?: unknown) {
  return server.app.inject({
    method,
    url,
    headers: { cookie: server.cookie },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
}

describe("Geheimnis", () => {
  it("laeuft hin und zurueck", () => {
    const gespeichert = verschluesseln(SCHLUESSEL, "geheim");
    expect(gespeichert).not.toContain(SCHLUESSEL);
    expect(entschluesseln(gespeichert, "geheim")).toBe(SCHLUESSEL);
  });

  it("liefert null statt zu werfen, wenn SESSION_SECRET gewechselt hat", () => {
    expect(entschluesseln(verschluesseln(SCHLUESSEL, "alt"), "neu")).toBeNull();
  });

  it("erkennt eine Manipulation des Geheimtexts", () => {
    const gespeichert = verschluesseln(SCHLUESSEL, "geheim");

    /*
     * Verbogen wird ein **Byte**, nicht ein Zeichen der Kodierung.
     *
     * Bis zum 10.08.2026 ersetzte der Test die letzten zwei Zeichen durch "xy" und fiel
     * dabei etwa bei jedem zehnten Lauf um. Der Grund ist base64: je nach Laenge traegt
     * das letzte Zeichen nur zwei bedeutsame Bits, die uebrigen vier sind Fuellung.
     * Mehrere verschiedene Zeichen kodieren dann dieselben Bytes, die Manipulation ging
     * ins Leere, und GCM hatte zu Recht nichts zu beanstanden.
     */
    const [iv, marke, geheim] = gespeichert.split(".");
    const bytes = Buffer.from(geheim as string, "base64url");
    bytes[0] = (bytes[0] as number) ^ 0xff;
    const verbogen = [iv, marke, bytes.toString("base64url")].join(".");

    expect(verbogen).not.toBe(gespeichert);
    expect(entschluesseln(verbogen, "geheim")).toBeNull();
  });
});

describe("Einstellungen des Assistenten", () => {
  it("meldet zu Beginn keinen Schluessel und das Standardmodell", async () => {
    const response = await mitCookie("GET", "/api/einstellungen/assistent");
    expect(response.statusCode).toBe(200);
    const gelesen = response.json<{ gesetzt: boolean; modell: string; endung: null }>();
    expect(gelesen.gesetzt).toBe(false);
    expect(gelesen.endung).toBeNull();
    expect(gelesen.modell).toBe("gpt-5.6-sol");
  });

  /**
   * Alle drei Antworten haben dieselbe Form. Fehlte `modelle` beim Speichern, rief die
   * Maske `stand.modelle.map` auf einem undefined auf und der Nutzer sah statt seines
   * gespeicherten Schluessels die Fehlerseite.
   */
  it("liefert bei jedem Weg dieselben Felder, auch die Modellauswahl", async () => {
    const antworten = [
      await mitCookie("GET", "/api/einstellungen/assistent"),
      await mitCookie("PUT", "/api/einstellungen/assistent", { schluessel: SCHLUESSEL }),
      await mitCookie("DELETE", "/api/einstellungen/assistent"),
    ];

    for (const antwort of antworten) {
      expect(antwort.statusCode).toBe(200);
      const gelesen = antwort.json<{ modelle: { id: string }[] }>();
      expect([...Object.keys(gelesen)].sort()).toEqual([
        "endung",
        "gesetzt",
        "modell",
        "modelle",
      ]);
      expect(gelesen.modelle.length).toBe(3);
    }
  });

  it("gibt den hinterlegten Schluessel niemals zurueck", async () => {
    await mitCookie("PUT", "/api/einstellungen/assistent", { schluessel: SCHLUESSEL });

    const response = await mitCookie("GET", "/api/einstellungen/assistent");
    expect(response.body).not.toContain(SCHLUESSEL);
    const gelesen = response.json<{ gesetzt: boolean; endung: string }>();
    expect(gelesen.gesetzt).toBe(true);
    expect(gelesen.endung).toBe("abcd");
  });

  it("legt den Schluessel verschluesselt ab, nicht im Klartext", async () => {
    await mitCookie("PUT", "/api/einstellungen/assistent", { schluessel: SCHLUESSEL });

    const zeilen = server.db.select().from(einstellungen).all();
    const zeile = zeilen.find((eintrag) => eintrag.schluessel === "assistent.schluessel");
    expect(zeile).toBeDefined();
    expect(zeile?.wert).not.toContain(SCHLUESSEL);
  });

  it("nimmt nur bekannte Modelle", async () => {
    const gut = await mitCookie("PUT", "/api/einstellungen/assistent", { modell: "gpt-5.6-luna" });
    expect(gut.json<{ modell: string }>().modell).toBe("gpt-5.6-luna");

    const schlecht = await mitCookie("PUT", "/api/einstellungen/assistent", { modell: "gpt-3" });
    expect(schlecht.statusCode).toBe(400);
    expect(schlecht.json<{ code: string }>().code).toBe("assistent-modell-unbekannt");
  });

  it("weist einen leeren Schluessel ab", async () => {
    const response = await mitCookie("PUT", "/api/einstellungen/assistent", { schluessel: "   " });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe("assistent-schluessel-ungueltig");
  });

  it("entfernt den Schluessel und laesst das Modell stehen", async () => {
    await mitCookie("PUT", "/api/einstellungen/assistent", {
      schluessel: SCHLUESSEL,
      modell: "gpt-5.6-terra",
    });

    const response = await mitCookie("DELETE", "/api/einstellungen/assistent");
    const danach = response.json<{ gesetzt: boolean; modell: string }>();
    expect(danach.gesetzt).toBe(false);
    expect(danach.modell).toBe("gpt-5.6-terra");
  });
});

describe("Vermittler", () => {
  it("antwortet ohne hinterlegten Schluessel mit einem uebersetzbaren Code", async () => {
    const response = await mitCookie("POST", "/api/assistent/nachricht", {
      eingabe: [{ role: "user", content: [{ type: "input_text", text: "Hallo" }] }],
    });
    expect(response.statusCode).toBe(412);
    expect(response.json<{ code: string }>().code).toBe("assistent-ohne-schluessel");
    // Kein Ereignisstrom: die Oberflaeche soll auf die Einstellungen zeigen koennen.
    expect(response.headers["content-type"]).not.toContain("event-stream");
  });

  it("weist eine leere Eingabe ab, bevor der Anbieter gerufen wird", async () => {
    await mitCookie("PUT", "/api/einstellungen/assistent", { schluessel: SCHLUESSEL });
    const response = await mitCookie("POST", "/api/assistent/nachricht", { eingabe: [] });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe("assistent-eingabe-fehlt");
  });

  it("deckelt einen ausufernden Verlauf", async () => {
    await mitCookie("PUT", "/api/einstellungen/assistent", { schluessel: SCHLUESSEL });
    const response = await mitCookie("POST", "/api/assistent/nachricht", {
      eingabe: Array.from({ length: 401 }, () => ({ role: "user", content: "x" })),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe("assistent-eingabe-zu-lang");
  });
});

/**
 * Der Abriss aus dem Betrieb: kurze Antworten liefen durch, ein langer Auftrag starb mit
 * einem Netzwerkfehler. Zwischen Kopfzeilen und erstem Ereignis floss kein Byte, und das
 * Zwischenstueck hielt die Verbindung fuer tot. Der Anbieter wird dafuer ersetzt, sonst
 * dauerte der Test so lange wie das Schweigen.
 */
describe("Der Strom haelt sich wach", () => {
  it("schickt Bytes, bevor der Anbieter das erste Ereignis liefert", async () => {
    let losgelassen = () => undefined as void;
    const wartet = new Promise<void>((aufloesen) => {
      losgelassen = () => {
        aufloesen();
      };
    });

    const zuruecksetzen = setzeAnbieter(async () => {
      await Promise.resolve();
      return {
        async *[Symbol.asyncIterator]() {
          // Schweigen, bis der Test es erlaubt.
          await wartet;
          yield {
            type: "response.completed",
            response: { output: [], usage: { input_tokens: 1, output_tokens: 1 } },
          };
        },
      };
    });

    try {
      await mitCookie("PUT", "/api/einstellungen/assistent", { schluessel: SCHLUESSEL });

      const lauf = mitCookie("POST", "/api/assistent/nachricht", {
        eingabe: [{ role: "user", content: [{ type: "input_text", text: "Lang" }] }],
      });

      // Waehrend der Anbieter schweigt, muss die Leitung schon Verkehr gesehen haben.
      await new Promise((weiter) => setTimeout(weiter, 50));
      losgelassen();

      const antwort = await lauf;
      expect(antwort.statusCode).toBe(200);
      expect(antwort.headers["content-type"]).toContain("text/event-stream");
      // Die Startzeile steht vor dem ersten Ereignis, nicht dahinter.
      expect(antwort.body.indexOf(": start")).toBeLessThan(antwort.body.indexOf("data: "));
      expect(antwort.body).toContain('"art":"fertig"');
    } finally {
      zuruecksetzen();
    }
  });

  it("reicht einen Fehler des Anbieters uebersetzbar weiter", async () => {
    const zuruecksetzen = setzeAnbieter(() =>
      Promise.reject(new Error("provider is down")),
    );
    try {
      await mitCookie("PUT", "/api/einstellungen/assistent", { schluessel: SCHLUESSEL });
      const antwort = await mitCookie("POST", "/api/assistent/nachricht", {
        eingabe: [{ role: "user", content: [{ type: "input_text", text: "Hallo" }] }],
      });
      // Vor den Kopfzeilen gescheitert: ein gewoehnlicher Fehler mit Code, kein Strom.
      expect(antwort.statusCode).toBe(500);
      expect(antwort.headers["content-type"]).not.toContain("event-stream");
    } finally {
      zuruecksetzen();
    }
  });
});

describe("Werkzeugkatalog", () => {
  it("erfuellt den strengen Modus: jedes Feld steht in required, nichts darf dazukommen", () => {
    for (const werkzeug of WERKZEUGE) {
      expect(werkzeug.type).toBe("function");
      expect(werkzeug.strict).toBe(true);
      expect(werkzeug.parameters.additionalProperties).toBe(false);
      expect([...werkzeug.parameters.required].sort()).toEqual(
        Object.keys(werkzeug.parameters.properties).sort(),
      );
      // Ohne Beschreibung raet das Modell, wofuer ein Werkzeug da ist.
      expect(werkzeug.description.length).toBeGreaterThan(40);
    }
  });

  it("fuehrt jeden Namen nur einmal", () => {
    const namen = WERKZEUGE.map((werkzeug) => werkzeug.name);
    expect(new Set(namen).size).toBe(namen.length);
    expect(namen).toHaveLength(14);
  });
});
