import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startTestServer, type TestServer } from "./helpers/app.js";
import { beispielEnvironment } from "./helpers/fixture.js";

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer({ MAX_UPLOAD_MB: "1" });
});

afterEach(async () => {
  await server.close();
});

const GRENZE = "\r\n";

function multipart(path: string, bytes: Buffer, dateiname = "datenblatt.pdf"): string {
  return `--x${GRENZE}Content-Disposition: form-data; name="path"${GRENZE}${GRENZE}${path}${GRENZE}--x${GRENZE}Content-Disposition: form-data; name="datei"; filename="${dateiname}"${GRENZE}Content-Type: application/pdf${GRENZE}${GRENZE}${bytes.toString("binary")}${GRENZE}--x--${GRENZE}`;
}

async function anlegen() {
  const response = await server.app.inject({
    method: "POST",
    url: "/api/projects",
    headers: { cookie: server.cookie },
    payload: { name: "Mit Anhang", environment: beispielEnvironment() },
  });
  return response.json<{ project: { id: string } }>().project;
}

async function hochladen(projektId: string, path: string, bytes: Buffer) {
  return server.app.inject({
    method: "POST",
    url: `/api/projects/${projektId}/files`,
    headers: { cookie: server.cookie, "content-type": "multipart/form-data; boundary=x" },
    payload: Buffer.from(multipart(path, bytes), "binary"),
  });
}

describe("Anhaenge", () => {
  it("laedt hoch und byteidentisch zurueck", async () => {
    const projekt = await anlegen();
    const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x10, 0x42]);

    const hochgeladen = await hochladen(projekt.id, "/aasx/dokumente/datenblatt.pdf", bytes);
    expect(hochgeladen.statusCode).toBe(201);
    const datei = hochgeladen.json<{ datei: { id: string; size: number } }>().datei;
    expect(datei.size).toBe(bytes.byteLength);

    const geladen = await server.app.inject({
      method: "GET",
      url: `/api/projects/${projekt.id}/files/${datei.id}`,
      headers: { cookie: server.cookie },
    });
    expect(geladen.statusCode).toBe(200);
    expect(Buffer.compare(geladen.rawPayload, bytes)).toBe(0);
  });

  it("weist eine zu grosse Datei ab", async () => {
    const projekt = await anlegen();
    const zuGross = Buffer.alloc(1024 * 1024 + 1024, 7);
    const response = await hochladen(projekt.id, "/aasx/dokumente/gross.pdf", zuGross);
    expect(response.statusCode).toBe(413);
  });

  it("markiert einen Anhang ohne File-Element als unreferenziert", async () => {
    const projekt = await anlegen();
    await hochladen(projekt.id, "/aasx/dokumente/datenblatt.pdf", Buffer.from("a"));
    await hochladen(projekt.id, "/aasx/dokumente/verwaist.pdf", Buffer.from("b"));

    await server.app.inject({
      method: "PUT",
      url: `/api/projects/${projekt.id}`,
      headers: { cookie: server.cookie },
      payload: { revision: 1, environment: beispielEnvironment() },
    });

    const liste = await server.app.inject({
      method: "GET",
      url: `/api/projects/${projekt.id}/files`,
      headers: { cookie: server.cookie },
    });
    const items = liste.json<{ items: { path: string; referenced: boolean }[] }>().items;
    const nachPfad = new Map(items.map((item) => [item.path, item.referenced]));
    expect(nachPfad.get("/aasx/dokumente/datenblatt.pdf")).toBe(true);
    expect(nachPfad.get("/aasx/dokumente/verwaist.pdf")).toBe(false);
  });

  it("ersetzt denselben Paketpfad statt ihn zu verdoppeln", async () => {
    const projekt = await anlegen();
    await hochladen(projekt.id, "/aasx/dokumente/datenblatt.pdf", Buffer.from("alt"));
    await hochladen(projekt.id, "/aasx/dokumente/datenblatt.pdf", Buffer.from("neu"));

    const liste = await server.app.inject({
      method: "GET",
      url: `/api/projects/${projekt.id}/files`,
      headers: { cookie: server.cookie },
    });
    const items = liste.json<{ items: { id: string; size: number }[] }>().items;
    expect(items).toHaveLength(1);

    const geladen = await server.app.inject({
      method: "GET",
      url: `/api/projects/${projekt.id}/files/${items[0]!.id}`,
      headers: { cookie: server.cookie },
    });
    expect(geladen.rawPayload.toString("utf8")).toBe("neu");
  });
});
