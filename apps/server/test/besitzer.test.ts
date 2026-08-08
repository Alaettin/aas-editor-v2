import { eq } from "drizzle-orm";
import type { LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projects } from "../src/db/schema.js";
import { BENUTZER, PASSWORT, startTestServer, type TestServer } from "./helpers/app.js";
import { beispielEnvironment } from "./helpers/fixture.js";

/**
 * Ein Projekt gehoert dem, der es angelegt hat (08.08.2026).
 *
 * Die Anmeldung des Testservers laeuft im Passwortmodus, dort gibt es genau einen Nutzer
 * mit der festen Kennung `einzelbenutzer`. Eine zweite Sitzung ist damit nicht zu haben,
 * und sie wird auch nicht gebraucht: gepruefte Zusage ist, dass eine Anfrage **nichts**
 * ueber ein Projekt erfaehrt, das einem anderen gehoert. Dafuer reicht es, dem Projekt in
 * der Ablage einen fremden Besitzer zu geben.
 */

const FREMD = "jemand-anderes";

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer();
});

afterEach(async () => {
  await server.close();
});

/** Legt ein Projekt an und schreibt es dem Fremden zu. Liefert seine Kennung. */
async function fremdesProjekt(name = "Fremdes Projekt"): Promise<string> {
  const angelegt = await server.app.inject({
    method: "POST",
    url: "/api/projects",
    headers: { cookie: server.cookie },
    payload: { name, environment: beispielEnvironment(), nodeCount: 11 },
  });
  expect(angelegt.statusCode).toBe(201);
  const id = angelegt.json<{ project: { id: string } }>().project.id;

  server.db.update(projects).set({ ownerId: FREMD }).where(eq(projects.id, id)).run();
  return id;
}

/**
 * Ein Aufruf mit der Sitzung des Testnutzers.
 *
 * Der Rueckgabetyp steht ausgeschrieben: `inject` hat eine Ueberladung mit Rueckruf, und
 * ohne Anmerkung leitet TypeScript aus der Vereinigung beider einen Typ ab, an dem weder
 * `statusCode` noch `json` haengt.
 */
async function hole(
  url: string,
  method: "GET" | "PUT" | "DELETE" = "GET",
  payload?: Record<string, unknown>,
): Promise<LightMyRequestResponse> {
  return await server.app.inject({ method, url, headers: { cookie: server.cookie }, payload });
}

describe("Besitzer", () => {
  it("zeigt fremde Projekte weder in der Liste noch in der Gesamtzahl", async () => {
    await fremdesProjekt();
    const eigen = await server.app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { cookie: server.cookie },
      payload: { name: "Eigenes Projekt", environment: beispielEnvironment(), nodeCount: 11 },
    });
    expect(eigen.statusCode).toBe(201);

    const liste = await hole("/api/projects");
    expect(liste.statusCode).toBe(200);
    const seite = liste.json<{ items: { name: string }[]; total: number }>();
    expect(seite.items.map((eintrag) => eintrag.name)).toEqual(["Eigenes Projekt"]);
    expect(seite.total).toBe(1);
  });

  it("antwortet auf jede Adresse eines fremden Projekts wie auf eine erfundene", async () => {
    const id = await fremdesProjekt();

    for (const [url, method] of [
      [`/api/projects/${id}`, "GET"],
      [`/api/projects/${id}/uebersicht`, "GET"],
      [`/api/projects/${id}/submodels`, "GET"],
      [`/api/projects/${id}/files`, "GET"],
      [`/api/projects/${id}`, "DELETE"],
    ] as const) {
      const antwort = await hole(url, method);
      expect(antwort.statusCode, `${method} ${url}`).toBe(404);
      expect(antwort.json<{ code: string }>().code).toBe("projekt-nicht-gefunden");
    }

    const geschrieben = await hole(`/api/projects/${id}`, "PUT", {
      environment: beispielEnvironment(),
    });
    expect(geschrieben.statusCode).toBe(404);
  });

  it("laesst ein fremdes Projekt beim Loeschen unberuehrt", async () => {
    const id = await fremdesProjekt();
    await hole(`/api/projects/${id}`, "DELETE");

    const zeile = server.db.select().from(projects).where(eq(projects.id, id)).get();
    expect(zeile?.ownerId).toBe(FREMD);
  });

  it("haelt den Namen nur je Besitzer eindeutig", async () => {
    // Derselbe Name, aber der Fremde hat ihn. Der eigene Anlauf muss durchgehen, und zwar
    // ohne dass die Antwort verraet, dass es das fremde Projekt gibt.
    await fremdesProjekt("Doppelt vergeben");

    const eigen = await server.app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { cookie: server.cookie },
      payload: { name: "Doppelt vergeben", environment: beispielEnvironment(), nodeCount: 11 },
    });
    expect(eigen.statusCode).toBe(201);

    // Zweimal derselbe Name beim selben Besitzer bleibt verboten.
    const nochmal = await server.app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { cookie: server.cookie },
      payload: { name: "Doppelt vergeben", environment: beispielEnvironment(), nodeCount: 11 },
    });
    expect(nochmal.statusCode).toBe(409);
    expect(nochmal.json<{ code: string }>().code).toBe("projektname-vergeben");
  });

  it("uebergibt herrenlose Projekte dem, der sich zuerst anmeldet", async () => {
    const id = await fremdesProjekt("Aus alter Zeit");
    // So sieht ein Projekt aus der Zeit vor der Trennung aus: Besitzer leer.
    server.db.update(projects).set({ ownerId: "" }).where(eq(projects.id, id)).run();

    const vorher = await hole("/api/projects");
    expect(vorher.json<{ total: number }>().total).toBe(0);

    const angemeldet = await server.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { benutzer: BENUTZER, passwort: PASSWORT },
    });
    expect(angemeldet.statusCode).toBe(200);

    const nachher = await hole("/api/projects");
    const seite = nachher.json<{ items: { name: string }[]; total: number }>();
    expect(seite.total).toBe(1);
    expect(seite.items[0]?.name).toBe("Aus alter Zeit");
  });
});
