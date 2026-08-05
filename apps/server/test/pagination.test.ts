import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startTestServer, type TestServer } from "./helpers/app.js";

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer();
});

afterEach(async () => {
  await server.close();
});

describe("Paginierung", () => {
  it("blaettert jedes Projekt genau einmal durch", async () => {
    for (let i = 0; i < 30; i += 1) {
      const response = await server.app.inject({
        method: "POST",
        url: "/api/projects",
        headers: { cookie: server.cookie },
        payload: { name: `Projekt ${i}`, environment: {} },
      });
      expect(response.statusCode).toBe(201);
    }

    const gesehen = new Set<string>();
    let cursor: string | null = null;
    let seiten = 0;

    do {
      const url: string = `/api/projects?limit=10${cursor === null ? "" : `&cursor=${cursor}`}`;
      const response = await server.app.inject({
        method: "GET",
        url,
        headers: { cookie: server.cookie },
      });
      expect(response.statusCode).toBe(200);
      const page = response.json<{ items: { id: string }[]; nextCursor: string | null }>();
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
    const response = await server.app.inject({
      method: "GET",
      url: "/api/projects?limit=500",
      headers: { cookie: server.cookie },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe("ungueltiges-limit");
  });

  it("weist einen kaputten Cursor ab", async () => {
    const response = await server.app.inject({
      method: "GET",
      url: "/api/projects?cursor=nichtbase64url%21",
      headers: { cookie: server.cookie },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe("ungueltiger-cursor");
  });
});
