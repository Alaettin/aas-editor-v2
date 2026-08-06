import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startTestServer, type TestServer } from "./helpers/app.js";

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer();
});

afterEach(async () => {
  await server.close();
});

/**
 * Zwei Arten zu blaettern, und das ist Absicht.
 *
 * Teilmodelle und Versionen blaettern ueber einen Cursor, so wie IDTA-01002 es vorgibt.
 * Die Projektliste blaettert seit dem Umbau des Einstiegs ueber Offset: dort stehen
 * Seitenzahlen und eine Gesamtzahl, und es darf nach jeder Spalte sortiert werden.
 */

async function projektMitTeilmodellen(anzahl: number): Promise<string> {
  const response = await server.app.inject({
    method: "POST",
    url: "/api/projects",
    headers: { cookie: server.cookie },
    payload: {
      name: "Blaettern",
      environment: {
        submodels: Array.from({ length: anzahl }, (_, i) => ({
          // Feste Breite, damit die Sortierung nach der id der Zahl folgt.
          id: `https://beispiel.de/sm/${String(i).padStart(3, "0")}`,
          idShort: `Teilmodell${String(i)}`,
          modelType: "Submodel",
        })),
      },
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ project: { id: string } }>().project.id;
}

describe("Cursor-Blaettern", () => {
  it("blaettert jedes Teilmodell genau einmal durch", async () => {
    const projektId = await projektMitTeilmodellen(30);

    const gesehen = new Set<string>();
    let cursor: string | null = null;
    let seiten = 0;

    do {
      // Die Annotationen sind noetig: ohne sie leitet TypeScript den Typ von `cursor`
      // ueber diese Zeilen aus sich selbst ab und gibt auf.
      const url: string = `/api/projects/${projektId}/submodels?limit=10${cursor === null ? "" : `&cursor=${cursor}`}`;
      const response = await server.app.inject({
        method: "GET",
        url,
        headers: { cookie: server.cookie },
      });
      expect(response.statusCode).toBe(200);
      const page: { items: { id: string }[]; nextCursor: string | null } = response.json();
      for (const item of page.items) {
        expect(gesehen.has(item.id)).toBe(false);
        gesehen.add(item.id);
      }
      cursor = page.nextCursor;
      seiten += 1;
    } while (cursor !== null && seiten < 10);

    expect(gesehen.size).toBe(30);
    expect(cursor).toBeNull();
  });

  it("weist ein Limit ausserhalb des Bereichs ab", async () => {
    const projektId = await projektMitTeilmodellen(1);
    const response = await server.app.inject({
      method: "GET",
      url: `/api/projects/${projektId}/submodels?limit=500`,
      headers: { cookie: server.cookie },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe("ungueltiges-limit");
  });

  it("weist einen kaputten Cursor ab", async () => {
    const projektId = await projektMitTeilmodellen(1);
    const response = await server.app.inject({
      method: "GET",
      url: `/api/projects/${projektId}/submodels?cursor=nichtbase64url%21`,
      headers: { cookie: server.cookie },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe("ungueltiger-cursor");
  });
});

describe("Offset-Blaettern der Projektliste", () => {
  it("blaettert jedes Projekt genau einmal durch und kennt die Gesamtzahl", async () => {
    for (let i = 0; i < 30; i += 1) {
      const response = await server.app.inject({
        method: "POST",
        url: "/api/projects",
        headers: { cookie: server.cookie },
        payload: { name: `Projekt ${String(i).padStart(2, "0")}`, environment: {} },
      });
      expect(response.statusCode).toBe(201);
    }

    const gesehen = new Set<string>();
    for (let offset = 0; offset < 30; offset += 10) {
      const response = await server.app.inject({
        method: "GET",
        url: `/api/projects?limit=10&offset=${String(offset)}&sort=name&dir=asc`,
        headers: { cookie: server.cookie },
      });
      expect(response.statusCode).toBe(200);
      const page = response.json<{ items: { id: string }[]; total: number }>();
      expect(page.total).toBe(30);
      expect(page.items).toHaveLength(10);
      for (const item of page.items) {
        expect(gesehen.has(item.id)).toBe(false);
        gesehen.add(item.id);
      }
    }
    expect(gesehen.size).toBe(30);
  });

  it("weist ein Limit ausserhalb des Bereichs ab", async () => {
    const response = await server.app.inject({
      method: "GET",
      url: "/api/projects?limit=500",
      headers: { cookie: server.cookie },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe("ungueltiges-limit");
  });

  it("weist eine unbekannte Sortierung ab", async () => {
    const response = await server.app.inject({
      method: "GET",
      url: "/api/projects?sort=geheim",
      headers: { cookie: server.cookie },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe("unbekannte-sortierung");
  });
});
