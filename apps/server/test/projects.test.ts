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

async function anlegen(name = "Testprojekt") {
  const response = await server.app.inject({
    method: "POST",
    url: "/api/projects",
    headers: { cookie: server.cookie },
    payload: { name, environment: beispielEnvironment(), sourceFormat: "aasx", nodeCount: 11 },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ project: { id: string; revision: number } }>().project;
}

describe("Projekte", () => {
  it("legt an, liest zurueck und haelt den Rundlauf ein", async () => {
    const projekt = await anlegen();

    const response = await server.app.inject({
      method: "GET",
      url: `/api/projects/${projekt.id}`,
      headers: { cookie: server.cookie },
    });
    expect(response.statusCode).toBe(200);

    const body = response.json<{ environment: unknown; revision: number }>();
    expect(body.revision).toBe(1);
    expect(kanonisch(body.environment)).toBe(kanonisch(beispielEnvironment()));
  });

  it("erhoeht die Revision beim Speichern", async () => {
    const projekt = await anlegen();
    const environment = beispielEnvironment();
    (environment["submodels"] as { idShort: string }[])[0]!.idShort = "TypenschildNeu";

    const response = await server.app.inject({
      method: "PUT",
      url: `/api/projects/${projekt.id}`,
      headers: { cookie: server.cookie },
      payload: { revision: 1, environment, nodeCount: 12 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ projekt: { revision: number } }>().projekt.revision).toBe(2);

    const gelesen = await server.app.inject({
      method: "GET",
      url: `/api/projects/${projekt.id}`,
      headers: { cookie: server.cookie },
    });
    const environmentZurueck = gelesen.json<{ environment: Record<string, { idShort: string }[]> }>()
      .environment;
    expect(environmentZurueck["submodels"]![0]!.idShort).toBe("TypenschildNeu");
  });

  it("antwortet auf eine veraltete Revision mit 409 und ueberschreibt nichts", async () => {
    const projekt = await anlegen();
    await server.app.inject({
      method: "PUT",
      url: `/api/projects/${projekt.id}`,
      headers: { cookie: server.cookie },
      payload: { revision: 1, environment: beispielEnvironment() },
    });

    const zweiterTab = await server.app.inject({
      method: "PUT",
      url: `/api/projects/${projekt.id}`,
      headers: { cookie: server.cookie },
      payload: { revision: 1, environment: { submodels: [] } },
    });
    expect(zweiterTab.statusCode).toBe(409);
    const fehler = zweiterTab.json<{ code: string; aktuelleRevision: number }>();
    expect(fehler.code).toBe("revision-konflikt");
    expect(fehler.aktuelleRevision).toBe(2);

    const gelesen = await server.app.inject({
      method: "GET",
      url: `/api/projects/${projekt.id}`,
      headers: { cookie: server.cookie },
    });
    const environment = gelesen.json<{ environment: Record<string, unknown[]> }>().environment;
    expect(environment["submodels"]).toHaveLength(2);
  });

  it("erlaubt zwei Submodels mit gleichem idShort, aber nicht mit gleicher id", async () => {
    const projekt = await anlegen();
    expect(projekt.revision).toBe(1);

    const environment = beispielEnvironment();
    const submodels = environment["submodels"] as { id: string }[];
    submodels[1]!.id = submodels[0]!.id;

    const response = await server.app.inject({
      method: "PUT",
      url: `/api/projects/${projekt.id}`,
      headers: { cookie: server.cookie },
      payload: { revision: 1, environment },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json<{ code: string }>().code).toBe("doppelte-id");
  });

  it("loescht kaskadierend", async () => {
    const projekt = await anlegen();
    const geloescht = await server.app.inject({
      method: "DELETE",
      url: `/api/projects/${projekt.id}`,
      headers: { cookie: server.cookie },
    });
    expect(geloescht.statusCode).toBe(204);

    const gelesen = await server.app.inject({
      method: "GET",
      url: `/api/projects/${projekt.id}`,
      headers: { cookie: server.cookie },
    });
    expect(gelesen.statusCode).toBe(404);

    const submodels = await server.app.inject({
      method: "GET",
      url: `/api/projects/${projekt.id}/submodels`,
      headers: { cookie: server.cookie },
    });
    expect(submodels.statusCode).toBe(404);
  });
});
