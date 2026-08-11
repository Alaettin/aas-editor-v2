import { encodeIdentifier } from "@aas-editor/core";
import { eq } from "drizzle-orm";
import type { LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projects } from "../src/db/schema.js";
import { startTestServer, type TestServer } from "./helpers/app.js";
import { beispielEnvironment } from "./helpers/fixture.js";

/**
 * Das Submodel Repository.
 *
 * Die Zusage, an der alles haengt, ist die **Momentaufnahme**: was uebernommen wurde, wird
 * weiter ausgeliefert, auch wenn das Projekt sich aendert. Sie laesst sich nur pruefen,
 * indem das Projekt nach der Uebernahme wirklich geschrieben wird, deshalb steht das hier
 * und nicht als Einheitentest am Dienst.
 */

const SUBMODEL_ID = "https://example.com/submodels/1";
const ZWEITE_ID = "https://example.com/submodels/2";
const FREMD = "jemand-anderes";

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer();
});

afterEach(async () => {
  await server.close();
});

async function ruf(
  url: string,
  method: "GET" | "POST" | "DELETE" = "GET",
  payload?: Record<string, unknown>,
): Promise<LightMyRequestResponse> {
  return await server.app.inject({ method, url, headers: { cookie: server.cookie }, payload });
}

/** Ohne Sitzung. Genau so kommt ein fremder AAS-Klient an. */
async function oeffentlich(url: string): Promise<LightMyRequestResponse> {
  return await server.app.inject({ method: "GET", url });
}

async function projektAnlegen(name = "Repository-Probe"): Promise<string> {
  const antwort = await ruf("/api/projects", "POST", {
    name,
    environment: beispielEnvironment(),
    nodeCount: 11,
  });
  expect(antwort.statusCode).toBe(201);
  return antwort.json<{ project: { id: string } }>().project.id;
}

async function starte(): Promise<{ id: string; basisAdresse: string }> {
  const antwort = await ruf("/api/repository", "POST");
  expect(antwort.statusCode).toBe(200);
  return antwort.json<{ id: string; basisAdresse: string }>();
}

async function uebernimm(
  projektId: string,
  submodelId: string,
  ueberschreiben = false,
): Promise<LightMyRequestResponse> {
  return await ruf("/api/repository/submodels", "POST", {
    projektId,
    submodelId,
    ...(ueberschreiben ? { ueberschreiben: true } : {}),
  });
}

describe("Repository starten", () => {
  it("meldet null, solange keines gestartet ist", async () => {
    const antwort = await ruf("/api/repository");
    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toBeNull();
  });

  it("liefert beim zweiten Starten dasselbe zurueck, keinen Konflikt", async () => {
    const erst = await starte();
    const nochmal = await starte();
    expect(nochmal.id).toBe(erst.id);
    expect(erst.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("traegt die Basis-Adresse mit der eigenen UUID, nicht mit der Nutzerkennung", async () => {
    const repo = await starte();
    expect(repo.basisAdresse).toMatch(new RegExp(`/api/repo/${repo.id}$`));
    expect(repo.basisAdresse).not.toContain("einzelbenutzer");
  });

  it("verweigert das Uebernehmen, solange keines gestartet ist", async () => {
    const projekt = await projektAnlegen();
    const antwort = await uebernimm(projekt, SUBMODEL_ID);
    expect(antwort.statusCode).toBe(404);
    expect(antwort.json<{ code: string }>().code).toBe("repository-nicht-gestartet");
  });
});

describe("Uebernehmen", () => {
  it("legt eine Momentaufnahme an, die eine Projektaenderung nicht mitmacht", async () => {
    const projekt = await projektAnlegen();
    const repo = await starte();
    expect((await uebernimm(projekt, SUBMODEL_ID)).statusCode).toBe(200);

    // Das Projekt wird weiterbearbeitet: der idShort des Teilmodells aendert sich.
    const environment = beispielEnvironment();
    const teilmodelle = environment["submodels"] as Record<string, unknown>[];
    teilmodelle[0]!["idShort"] = "NachDerUebernahmeGeaendert";
    const gespeichert = await server.app.inject({
      method: "PUT",
      url: `/api/projects/${projekt}`,
      headers: { cookie: server.cookie },
      payload: { environment },
    });
    expect(gespeichert.statusCode).toBe(200);

    // Das Projekt zeigt den neuen Stand ...
    const ausProjekt = await ruf(
      `/api/projects/${projekt}/submodels/${encodeIdentifier(SUBMODEL_ID)}`,
    );
    expect(ausProjekt.json<{ idShort: string }>().idShort).toBe("NachDerUebernahmeGeaendert");

    // ... das Repository unveraendert den alten. Das ist die ganze Zusage.
    const ausRepo = await oeffentlich(
      `/api/repo/${repo.id}/submodels/${encodeIdentifier(SUBMODEL_ID)}`,
    );
    expect(ausRepo.statusCode).toBe(200);
    expect(ausRepo.json<{ idShort: string }>().idShort).toBe("Typenschild");
  });

  it("meldet ein zweites Mal als 409 mit Angaben zur Rueckfrage", async () => {
    const projekt = await projektAnlegen();
    await starte();
    await uebernimm(projekt, SUBMODEL_ID);

    const nochmal = await uebernimm(projekt, SUBMODEL_ID);
    expect(nochmal.statusCode).toBe(409);
    const rumpf = nochmal.json<{
      code: string;
      idShort: string;
      uebernommenAm: number;
      herkunftProjektName: string;
    }>();
    expect(rumpf.code).toBe("submodel-schon-im-repo");
    expect(rumpf.idShort).toBe("Typenschild");
    expect(rumpf.herkunftProjektName).toBe("Repository-Probe");
    expect(rumpf.uebernommenAm).toBeGreaterThan(0);
  });

  it("zieht den Stand nach, wenn ueberschrieben werden soll", async () => {
    const projekt = await projektAnlegen();
    const repo = await starte();
    await uebernimm(projekt, SUBMODEL_ID);

    const environment = beispielEnvironment();
    (environment["submodels"] as Record<string, unknown>[])[0]!["idShort"] = "Nachgezogen";
    await server.app.inject({
      method: "PUT",
      url: `/api/projects/${projekt}`,
      headers: { cookie: server.cookie },
      payload: { environment },
    });

    const nochmal = await uebernimm(projekt, SUBMODEL_ID, true);
    expect(nochmal.statusCode).toBe(200);
    expect(nochmal.json<{ ueberschrieben: boolean }>().ueberschrieben).toBe(true);

    const ausRepo = await oeffentlich(
      `/api/repo/${repo.id}/submodels/${encodeIdentifier(SUBMODEL_ID)}`,
    );
    expect(ausRepo.json<{ idShort: string }>().idShort).toBe("Nachgezogen");

    // Es bleibt bei einer Zeile: die id ist im Repository eindeutig.
    const liste = await ruf("/api/repository/submodels");
    expect(liste.json<{ items: unknown[] }>().items).toHaveLength(1);
  });

  it("laesst ein fremdes Projekt aussehen wie ein erfundenes", async () => {
    const projekt = await projektAnlegen();
    await starte();
    server.db.update(projects).set({ ownerId: FREMD }).where(eq(projects.id, projekt)).run();

    const antwort = await uebernimm(projekt, SUBMODEL_ID);
    expect(antwort.statusCode).toBe(404);
    expect(antwort.json<{ code: string }>().code).toBe("projekt-nicht-gefunden");
  });

  it("nimmt kein Teilmodell an, das es im Projekt nicht gibt", async () => {
    const projekt = await projektAnlegen();
    await starte();
    const antwort = await uebernimm(projekt, "https://example.com/gibtsnicht");
    expect(antwort.statusCode).toBe(404);
    expect(antwort.json<{ code: string }>().code).toBe("submodel-nicht-gefunden");
  });

  it("entfernt eine Zeile und liefert sie danach nicht mehr aus", async () => {
    const projekt = await projektAnlegen();
    const repo = await starte();
    await uebernimm(projekt, SUBMODEL_ID);

    const geloescht = await ruf(
      `/api/repository/submodels/${encodeIdentifier(SUBMODEL_ID)}`,
      "DELETE",
    );
    expect(geloescht.statusCode).toBe(204);

    const ausRepo = await oeffentlich(
      `/api/repo/${repo.id}/submodels/${encodeIdentifier(SUBMODEL_ID)}`,
    );
    expect(ausRepo.statusCode).toBe(404);
  });
});

describe("Die oeffentliche Schnittstelle nach IDTA-01002", () => {
  it("liefert die Liste ohne Sitzung, in der Form der Spezifikation", async () => {
    const projekt = await projektAnlegen();
    const repo = await starte();
    await uebernimm(projekt, SUBMODEL_ID);
    await uebernimm(projekt, ZWEITE_ID);

    const antwort = await oeffentlich(`/api/repo/${repo.id}/submodels`);
    expect(antwort.statusCode).toBe(200);
    const rumpf = antwort.json<{ result: { id: string }[]; paging_metadata?: unknown }>();
    expect(rumpf.result.map((sm) => sm.id)).toEqual([SUBMODEL_ID, ZWEITE_ID]);
    // Ohne naechste Seite steht kein Cursor da, statt eines null, den ein Klient als
    // Zeichenkette liest.
    expect(rumpf.paging_metadata).toBeUndefined();
  });

  it("blaettert ueber den Cursor", async () => {
    const projekt = await projektAnlegen();
    const repo = await starte();
    await uebernimm(projekt, SUBMODEL_ID);
    await uebernimm(projekt, ZWEITE_ID);

    const erste = await oeffentlich(`/api/repo/${repo.id}/submodels?limit=1`);
    const seite1 = erste.json<{
      result: { id: string }[];
      paging_metadata: { cursor: string };
    }>();
    expect(seite1.result.map((sm) => sm.id)).toEqual([SUBMODEL_ID]);
    expect(seite1.paging_metadata.cursor).toBeTruthy();

    const zweite = await oeffentlich(
      `/api/repo/${repo.id}/submodels?limit=1&cursor=${encodeURIComponent(seite1.paging_metadata.cursor)}`,
    );
    const seite2 = zweite.json<{ result: { id: string }[]; paging_metadata?: unknown }>();
    expect(seite2.result.map((sm) => sm.id)).toEqual([ZWEITE_ID]);
    expect(seite2.paging_metadata).toBeUndefined();
  });

  it("filtert nach idShort", async () => {
    const projekt = await projektAnlegen();
    const repo = await starte();
    await uebernimm(projekt, SUBMODEL_ID);

    const treffer = await oeffentlich(`/api/repo/${repo.id}/submodels?idShort=Typenschild`);
    expect(treffer.json<{ result: unknown[] }>().result).toHaveLength(1);

    const daneben = await oeffentlich(`/api/repo/${repo.id}/submodels?idShort=Gibtsnicht`);
    expect(daneben.json<{ result: unknown[] }>().result).toHaveLength(0);
  });

  it("liefert genau das Teilmodell, nicht die Umgebung", async () => {
    const projekt = await projektAnlegen();
    const repo = await starte();
    await uebernimm(projekt, SUBMODEL_ID);

    const antwort = await oeffentlich(
      `/api/repo/${repo.id}/submodels/${encodeIdentifier(SUBMODEL_ID)}`,
    );
    const submodel = antwort.json<Record<string, unknown>>();
    expect(submodel["modelType"]).toBe("Submodel");
    expect(submodel["id"]).toBe(SUBMODEL_ID);
    expect(Object.keys(submodel)).not.toContain("assetAdministrationShells");
  });

  it("meldet eine unbekannte Adresse in der Form der Spezifikation, nicht in der eigenen", async () => {
    const antwort = await oeffentlich("/api/repo/gibt-es-nicht/submodels");
    expect(antwort.statusCode).toBe(404);
    const rumpf = antwort.json<{
      messages: { code: string; messageType: string; text: string; timestamp: string }[];
    }>();
    expect(rumpf.messages).toHaveLength(1);
    expect(rumpf.messages[0]!.code).toBe("404");
    expect(rumpf.messages[0]!.messageType).toBe("Error");
    expect(rumpf.messages[0]!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("gibt einer unbekannten Adresse dieselbe Antwort wie einem unbekannten Teilmodell", async () => {
    const projekt = await projektAnlegen();
    const repo = await starte();
    await uebernimm(projekt, SUBMODEL_ID);
    const kodiert = encodeIdentifier("https://example.com/gibtsnicht");

    const fremdeAdresse = await oeffentlich(`/api/repo/gibt-es-nicht/submodels/${kodiert}`);
    const fremdesTeilmodell = await oeffentlich(`/api/repo/${repo.id}/submodels/${kodiert}`);

    expect(fremdeAdresse.statusCode).toBe(404);
    expect(fremdesTeilmodell.statusCode).toBe(404);
    expect(fremdeAdresse.json<{ messages: { text: string }[] }>().messages[0]!.text).toBe(
      fremdesTeilmodell.json<{ messages: { text: string }[] }>().messages[0]!.text,
    );
  });

  it("meldet auch einen unlesbaren Cursor in der Form der Spezifikation", async () => {
    const repo = await starte();
    const antwort = await oeffentlich(`/api/repo/${repo.id}/submodels?cursor=keinbase64!`);
    expect(antwort.statusCode).toBe(400);
    expect(antwort.json<{ messages: { code: string }[] }>().messages[0]!.code).toBe("400");
  });

  /**
   * Eine lange id, so wie sie in echten Herstellerdateien steht.
   *
   * Kodiert ergibt das weit mehr als hundert Zeichen, und genau dort deckelt Fastifys
   * Router einen Pfadparameter von Haus aus. Ohne `maxParamLength` in `app.ts` antwortet
   * dieser Aufruf mit **414**, nicht mit dem Teilmodell. Nachgemessen, nicht vermutet: die
   * Gegenprobe mit auskommentierter Zeile laesst genau diesen Fall scheitern.
   */
  it("liefert auch ein Teilmodell mit langer id, kodiert ueber hundert Zeichen", async () => {
    const langeId =
      "https://www.pepperl-fuchs.com/ids/sm/WILSEN_sonic_level_WS-UC7000-F406-B41-01-02/nameplate/digital-nameplate-fuer-industrielle-einrichtungen";
    const environment = beispielEnvironment();
    (environment["submodels"] as Record<string, unknown>[])[0]!["id"] = langeId;

    const projekt = await ruf("/api/projects", "POST", {
      name: "Lange Kennung",
      environment,
      nodeCount: 11,
    });
    const projektId = projekt.json<{ project: { id: string } }>().project.id;
    const repo = await starte();

    expect((await uebernimm(projektId, langeId)).statusCode).toBe(200);

    const kodiert = encodeIdentifier(langeId);
    expect(kodiert.length).toBeGreaterThan(100);

    const oeffentlichesTeilmodell = await oeffentlich(
      `/api/repo/${repo.id}/submodels/${kodiert}`,
    );
    expect(oeffentlichesTeilmodell.statusCode).toBe(200);
    expect(oeffentlichesTeilmodell.json<{ id: string }>().id).toBe(langeId);

    // Derselbe Deckel traf das Entfernen und den Projektpfad.
    const ausProjekt = await ruf(`/api/projects/${projektId}/submodels/${kodiert}`);
    expect(ausProjekt.statusCode).toBe(200);

    const entfernt = await ruf(`/api/repository/submodels/${kodiert}`, "DELETE");
    expect(entfernt.statusCode).toBe(204);
  });

  it("zeigt das Repository eines anderen nicht unter der eigenen Adresse", async () => {
    const projekt = await projektAnlegen();
    const repo = await starte();
    await uebernimm(projekt, SUBMODEL_ID);

    // Eine erfundene, aber gueltig aussehende UUID.
    const fremd = repo.id.slice(0, -1) + (repo.id.endsWith("a") ? "b" : "a");
    const antwort = await oeffentlich(`/api/repo/${fremd}/submodels`);
    expect(antwort.statusCode).toBe(404);
  });
});
