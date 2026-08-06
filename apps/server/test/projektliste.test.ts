import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startTestServer, type TestServer } from "./helpers/app.js";

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer();
});

afterEach(async () => {
  await server.close();
});

interface Angelegt {
  readonly name: string;
  readonly sourceFormat?: string;
  readonly metamodelVersion?: string;
  readonly teilmodelle?: number;
}

async function anlegen(eingabe: Angelegt): Promise<string> {
  const response = await server.app.inject({
    method: "POST",
    url: "/api/projects",
    headers: { cookie: server.cookie },
    payload: {
      name: eingabe.name,
      sourceFormat: eingabe.sourceFormat ?? "json",
      metamodelVersion: eingabe.metamodelVersion ?? "3.1",
      environment: {
        submodels: Array.from({ length: eingabe.teilmodelle ?? 0 }, (_, i) => ({
          id: `https://beispiel.de/${eingabe.name}/${String(i)}`,
          idShort: `Teilmodell${String(i)}`,
          modelType: "Submodel",
        })),
      },
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ project: { id: string } }>().project.id;
}

interface Antwort {
  readonly items: { name: string; submodelCount: number; sourceFormat: string }[];
  readonly total: number;
}

async function liste(query: string): Promise<Antwort> {
  const response = await server.app.inject({
    method: "GET",
    url: `/api/projects${query}`,
    headers: { cookie: server.cookie },
  });
  expect(response.statusCode).toBe(200);
  return response.json<Antwort>();
}

async function bestand(): Promise<void> {
  await anlegen({ name: "Antrieb", sourceFormat: "aasx", teilmodelle: 3 });
  await anlegen({ name: "Sensor", sourceFormat: "json", teilmodelle: 1 });
  await anlegen({ name: "Sensor Gross", sourceFormat: "json", teilmodelle: 5 });
  await anlegen({ name: "Ventil", sourceFormat: "xml", metamodelVersion: "3.0" });
}

describe("Projektliste", () => {
  it("liefert die Teilmodellzahl je Zeile", async () => {
    await bestand();
    const seite = await liste("?sort=name&dir=asc");
    expect(seite.items.map((p) => [p.name, p.submodelCount])).toEqual([
      ["Antrieb", 3],
      ["Sensor", 1],
      ["Sensor Gross", 5],
      ["Ventil", 0],
    ]);
  });

  it("sucht im Namen, ohne Platzhalter durchzulassen", async () => {
    await bestand();
    expect((await liste("?q=sensor")).total).toBe(2);
    // Der Unterstrich ist in LIKE ein Platzhalter. Entwertet trifft er nichts.
    expect((await liste("?q=_")).total).toBe(0);
  });

  it("sortiert nach der Teilmodellzahl", async () => {
    await bestand();
    const seite = await liste("?sort=submodelCount&dir=desc");
    expect(seite.items.map((p) => p.submodelCount)).toEqual([5, 3, 1, 0]);
  });

  it("filtert nach Zeitpunkt", async () => {
    await bestand();
    const jetzt = Date.now();
    expect((await liste(`?seit=${String(jetzt - 60_000)}`)).total).toBe(4);
    expect((await liste(`?seit=${String(jetzt + 60_000)}`)).total).toBe(0);
  });
});

describe("Projektnamen", () => {
  it("laesst denselben Namen kein zweites Mal zu", async () => {
    await anlegen({ name: "Einmalig" });

    const zweiter = await server.app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { cookie: server.cookie },
      payload: { name: "Einmalig", environment: {} },
    });
    expect(zweiter.statusCode).toBe(409);
    expect(zweiter.json<{ code: string; name: string }>()).toMatchObject({
      code: "projektname-vergeben",
      name: "Einmalig",
    });
  });

  it("laesst auch das Umbenennen nicht auf einen vergebenen Namen laufen", async () => {
    await anlegen({ name: "Erster" });
    const zweiter = await anlegen({ name: "Zweiter" });

    const umbenannt = await server.app.inject({
      method: "PUT",
      url: `/api/projects/${zweiter}`,
      headers: { cookie: server.cookie },
      payload: { revision: 1, environment: {}, name: "Erster" },
    });
    expect(umbenannt.statusCode).toBe(409);
    expect(umbenannt.json<{ code: string }>().code).toBe("projektname-vergeben");
  });

  it("laesst ein Projekt unter seinem eigenen Namen speichern", async () => {
    const id = await anlegen({ name: "Bleibt" });
    const gespeichert = await server.app.inject({
      method: "PUT",
      url: `/api/projects/${id}`,
      headers: { cookie: server.cookie },
      payload: { revision: 1, environment: {}, name: "Bleibt" },
    });
    expect(gespeichert.statusCode).toBe(200);
  });
});
