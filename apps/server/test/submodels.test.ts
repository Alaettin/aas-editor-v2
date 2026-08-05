import { encodeIdentifier } from "@aas-editor/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startTestServer, type TestServer } from "./helpers/app.js";
import { beispielEnvironment } from "./helpers/fixture.js";

let server: TestServer;
const SUBMODEL_ID = "https://example.com/submodels/1";

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
    payload: { name: "Repository-Probe", environment: beispielEnvironment() },
  });
  return response.json<{ project: { id: string } }>().project;
}

describe("Einzelnes Submodel unter seiner kodierten id", () => {
  it("liest genau ein Submodel, nicht die Umgebung", async () => {
    const projekt = await anlegen();
    const response = await server.app.inject({
      method: "GET",
      url: `/api/projects/${projekt.id}/submodels/${encodeIdentifier(SUBMODEL_ID)}`,
      headers: { cookie: server.cookie },
    });
    expect(response.statusCode).toBe(200);
    const submodel = response.json<{ id: string; idShort: string; modelType: string }>();
    expect(submodel.id).toBe(SUBMODEL_ID);
    expect(submodel.modelType).toBe("Submodel");
    expect(Object.keys(submodel)).not.toContain("submodels");
  });

  it("schreibt ein einzelnes Submodel und erhoeht die Revision", async () => {
    const projekt = await anlegen();
    const kodiert = encodeIdentifier(SUBMODEL_ID);

    const gelesen = await server.app.inject({
      method: "GET",
      url: `/api/projects/${projekt.id}/submodels/${kodiert}`,
      headers: { cookie: server.cookie },
    });
    const submodel = gelesen.json<Record<string, unknown>>();
    submodel["idShort"] = "UeberDieSchnittstelle";

    const geschrieben = await server.app.inject({
      method: "PUT",
      url: `/api/projects/${projekt.id}/submodels/${kodiert}`,
      headers: { cookie: server.cookie },
      payload: submodel,
    });
    expect(geschrieben.statusCode).toBe(200);
    expect(geschrieben.json<{ revision: number }>().revision).toBe(2);

    const environment = await server.app.inject({
      method: "GET",
      url: `/api/projects/${projekt.id}`,
      headers: { cookie: server.cookie },
    });
    const submodels = environment.json<{ environment: Record<string, { idShort: string }[]> }>()
      .environment["submodels"]!;
    expect(submodels[0]!.idShort).toBe("UeberDieSchnittstelle");
  });

  it("weist eine Kennung ab, die nicht base64url ist", async () => {
    const projekt = await anlegen();
    const response = await server.app.inject({
      method: "GET",
      url: `/api/projects/${projekt.id}/submodels/nicht%21kodiert`,
      headers: { cookie: server.cookie },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe("ungueltige-kennung");
  });

  it("meldet eine unbekannte id als 404", async () => {
    const projekt = await anlegen();
    const response = await server.app.inject({
      method: "GET",
      url: `/api/projects/${projekt.id}/submodels/${encodeIdentifier("https://example.com/x")}`,
      headers: { cookie: server.cookie },
    });
    expect(response.statusCode).toBe(404);
  });

  it("weist einen Rumpf ab, dessen id dem Pfad widerspricht", async () => {
    const projekt = await anlegen();
    const response = await server.app.inject({
      method: "PUT",
      url: `/api/projects/${projekt.id}/submodels/${encodeIdentifier(SUBMODEL_ID)}`,
      headers: { cookie: server.cookie },
      payload: { modelType: "Submodel", id: "https://example.com/anders" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe("kennung-widerspricht");
  });
});
