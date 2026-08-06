import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projects } from "../src/db/schema.js";
import { startTestServer, type TestServer } from "./helpers/app.js";

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer();
});

afterEach(async () => {
  await server.close();
});

/**
 * Ein Teilmodell mit gueltigem idShort. Das Muster der SDK lautet
 * `^[a-zA-Z][a-zA-Z0-9_-]*[a-zA-Z0-9_]+$` und verlangt **mindestens zwei** Zeichen.
 */
function teilmodell(idShort: string, nummer = 0) {
  return {
    modelType: "Submodel",
    id: `https://beispiel.de/sm/${String(nummer)}`,
    idShort,
  };
}

async function anlegen(name: string, environment: unknown): Promise<string> {
  const response = await server.app.inject({
    method: "POST",
    url: "/api/projects",
    headers: { cookie: server.cookie },
    payload: { name, environment },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ project: { id: string } }>().project.id;
}

async function befunde(id: string): Promise<number> {
  const response = await server.app.inject({
    method: "GET",
    url: `/api/projects/${id}/uebersicht`,
    headers: { cookie: server.cookie },
  });
  expect(response.statusCode).toBe(200);
  return response.json<{ befunde: number }>().befunde;
}

describe("Befunde", () => {
  it("meldet null, wenn nichts zu beanstanden ist", async () => {
    const id = await anlegen("Sauber", { submodels: [teilmodell("Typenschild")] });
    expect(await befunde(id)).toBe(0);
  });

  it("zaehlt einen Constraint-Verstoss", async () => {
    // Ein einbuchstabiger idShort verletzt das Muster der SDK.
    const id = await anlegen("Kurz", { submodels: [teilmodell("A")] });
    expect(await befunde(id)).toBe(1);
  });

  it("zaehlt ein File-Element ohne abgelegten Anhang als Datenwarnung", async () => {
    const id = await anlegen("Ohne Anhang", {
      submodels: [
        {
          ...teilmodell("Typenschild"),
          submodelElements: [
            {
              modelType: "File",
              idShort: "Handbuch",
              contentType: "application/pdf",
              value: "/aasx/files/handbuch.pdf",
            },
          ],
        },
      ],
    });
    // Ohne die Pfade aus der files-Tabelle waere das der Normalfall statt der Ausnahme:
    // dann meldete **jedes** File-Element einen fehlenden Anhang.
    expect(await befunde(id)).toBe(1);
  });

  it("rechnet nicht neu, solange die Fassung dieselbe ist", async () => {
    const id = await anlegen("Gemerkt", { submodels: [teilmodell("A")] });
    expect(await befunde(id)).toBe(1);

    // Eine untergeschobene Zahl beweist, dass gelesen und nicht gerechnet wird.
    server.db.update(projects).set({ issueCount: 99 }).where(eq(projects.id, id)).run();
    expect(await befunde(id)).toBe(99);
  });

  it("rechnet neu, sobald gespeichert wurde", async () => {
    const id = await anlegen("Erneuert", { submodels: [teilmodell("A")] });
    expect(await befunde(id)).toBe(1);
    server.db.update(projects).set({ issueCount: 99 }).where(eq(projects.id, id)).run();

    const gespeichert = await server.app.inject({
      method: "PUT",
      url: `/api/projects/${id}`,
      headers: { cookie: server.cookie },
      payload: { revision: 1, environment: { submodels: [teilmodell("Typenschild")] } },
    });
    expect(gespeichert.statusCode).toBe(200);

    // Die untergeschobene 99 gilt fuer Fassung 1, gefragt ist jetzt Fassung 2.
    expect(await befunde(id)).toBe(0);
  });
});
