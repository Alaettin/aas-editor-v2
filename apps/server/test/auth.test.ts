import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BENUTZER, PASSWORT, startTestServer, type TestServer } from "./helpers/app.js";

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer();
});

afterEach(async () => {
  await server.close();
});

describe("Anmeldung", () => {
  it("weist ein falsches Passwort ohne Cookie ab", async () => {
    const response = await server.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { benutzer: BENUTZER, passwort: "falsch" },
    });
    expect(response.statusCode).toBe(401);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("weist ein zu kurzes Passwort ab, statt an timingSafeEqual zu scheitern", async () => {
    const response = await server.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { benutzer: BENUTZER, passwort: "x" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("setzt bei richtigen Zugangsdaten ein httpOnly-Cookie", async () => {
    const response = await server.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { benutzer: BENUTZER, passwort: PASSWORT },
    });
    expect(response.statusCode).toBe(200);
    const raw = response.headers["set-cookie"];
    const cookie = Array.isArray(raw) ? raw[0] : raw;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });

  it("liefert den Benutzer mit Cookie und 401 ohne", async () => {
    const mit = await server.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: server.cookie },
    });
    expect(mit.statusCode).toBe(200);
    expect(mit.json<{ benutzer: { name: string } }>().benutzer.name).toBe(BENUTZER);

    const ohne = await server.app.inject({ method: "GET", url: "/api/auth/me" });
    expect(ohne.statusCode).toBe(401);
  });

  it("verwirft ein manipuliertes Cookie", async () => {
    const manipuliert = `${server.cookie.slice(0, -2)}xy`;
    const response = await server.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: manipuliert },
    });
    expect(response.statusCode).toBe(401);
  });

  it("verwirft eine abgelaufene Sitzung", async () => {
    const kurz = await startTestServer({ SESSION_TTL_HOURS: "0.0000001" });
    try {
      await new Promise((r) => setTimeout(r, 20));
      const response = await kurz.app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { cookie: kurz.cookie },
      });
      expect(response.statusCode).toBe(401);
    } finally {
      await kurz.close();
    }
  });

  it("loescht die Sitzung beim Abmelden", async () => {
    const response = await server.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie: server.cookie },
    });
    const raw = response.headers["set-cookie"];
    const cookie = Array.isArray(raw) ? raw[0] : raw;
    expect(cookie).toContain("aas_sitzung=;");
  });

  it("sperrt nach zehn Fehlversuchen", async () => {
    const eigen = await startTestServer();
    try {
      const codes: number[] = [];
      for (let i = 0; i < 11; i += 1) {
        const response = await eigen.app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { benutzer: BENUTZER, passwort: "falsch" },
          remoteAddress: "10.0.0.5",
        });
        codes.push(response.statusCode);
      }
      expect(codes.slice(0, 10).every((code) => code === 401)).toBe(true);
      expect(codes[10]).toBe(429);
    } finally {
      await eigen.close();
    }
  });
});

describe("requireAuth", () => {
  // Tabellengetrieben, damit eine spaeter hinzugefuegte Route nicht stillschweigend
  // ohne Anmeldung erreichbar bleibt.
  const routen: readonly [string, string][] = [
    ["GET", "/api/projects"],
    ["POST", "/api/projects"],
    ["GET", "/api/projects/irgendwas"],
    ["PUT", "/api/projects/irgendwas"],
    ["DELETE", "/api/projects/irgendwas"],
    ["GET", "/api/projects/irgendwas/files"],
    ["POST", "/api/projects/irgendwas/files"],
    ["GET", "/api/projects/irgendwas/files/f1"],
    ["DELETE", "/api/projects/irgendwas/files/f1"],
    ["GET", "/api/projects/irgendwas/submodels"],
    ["GET", "/api/projects/irgendwas/submodels/abc"],
    ["PUT", "/api/projects/irgendwas/submodels/abc"],
    ["GET", "/api/einstellungen/assistent"],
    ["PUT", "/api/einstellungen/assistent"],
    ["DELETE", "/api/einstellungen/assistent"],
    ["POST", "/api/assistent/nachricht"],
  ];

  it.each(routen)("%s %s ohne Cookie ergibt 401", async (method, url) => {
    const response = await server.app.inject({ method: method as "GET", url });
    expect(response.statusCode).toBe(401);
  });
});

describe("Health", () => {
  it("antwortet ohne Anmeldung und mit Datenbankzugriff", async () => {
    const response = await server.app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ db: string }>().db).toBe("ok");
  });
});
