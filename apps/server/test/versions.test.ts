import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startTestServer, type TestServer } from "./helpers/app.js";
import { beispielEnvironment, kanonisch } from "./helpers/fixture.js";

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer();
});

afterEach(async () => {
  await server.close();
});

async function anlegen() {
  const response = await server.app.inject({
    method: "POST",
    url: "/api/projects",
    headers: { cookie: server.cookie },
    payload: { name: "Mit Versionen", environment: beispielEnvironment(), nodeCount: 11 },
  });
  return response.json<{ project: { id: string } }>().project;
}

describe("Versionen", () => {
  it("haelt den alten Stand fest, waehrend das Projekt weiterlaeuft", async () => {
    const projekt = await anlegen();

    const angelegt = await server.app.inject({
      method: "POST",
      url: `/api/projects/${projekt.id}/versions`,
      headers: { cookie: server.cookie },
      payload: { label: "vor der Aenderung" },
    });
    expect(angelegt.statusCode).toBe(201);
    const version = angelegt.json<{
      version: { id: string; snapshotBytes: number; label: string };
    }>().version;
    expect(version.label).toBe("vor der Aenderung");

    await server.app.inject({
      method: "PUT",
      url: `/api/projects/${projekt.id}`,
      headers: { cookie: server.cookie },
      payload: { revision: 1, environment: { submodels: [] } },
    });

    const geladen = await server.app.inject({
      method: "GET",
      url: `/api/projects/${projekt.id}/versions/${version.id}`,
      headers: { cookie: server.cookie },
    });
    expect(geladen.statusCode).toBe(200);
    expect(kanonisch(geladen.json<{ environment: unknown }>().environment)).toBe(
      kanonisch(beispielEnvironment()),
    );

    const aktuell = await server.app.inject({
      method: "GET",
      url: `/api/projects/${projekt.id}`,
      headers: { cookie: server.cookie },
    });
    expect(aktuell.json<{ environment: Record<string, unknown[]> }>().environment["submodels"])
      .toHaveLength(0);
  });

  it("komprimiert den Schnappschuss", async () => {
    const projekt = await anlegen();
    const angelegt = await server.app.inject({
      method: "POST",
      url: `/api/projects/${projekt.id}/versions`,
      headers: { cookie: server.cookie },
      payload: {},
    });
    const version = angelegt.json<{ version: { snapshotBytes: number } }>().version;
    expect(version.snapshotBytes).toBeLessThan(JSON.stringify(beispielEnvironment()).length);
  });

  it("listet Versionen seitenweise", async () => {
    const projekt = await anlegen();
    for (let i = 0; i < 3; i += 1) {
      await server.app.inject({
        method: "POST",
        url: `/api/projects/${projekt.id}/versions`,
        headers: { cookie: server.cookie },
        payload: { label: `Stand ${i}` },
      });
    }

    const response = await server.app.inject({
      method: "GET",
      url: `/api/projects/${projekt.id}/versions?limit=2`,
      headers: { cookie: server.cookie },
    });
    const page = response.json<{ items: unknown[]; nextCursor: string | null }>();
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
  });

  it("meldet eine unbekannte Version als 404", async () => {
    const projekt = await anlegen();
    const response = await server.app.inject({
      method: "GET",
      url: `/api/projects/${projekt.id}/versions/gibtesnicht`,
      headers: { cookie: server.cookie },
    });
    expect(response.statusCode).toBe(404);
  });
});
