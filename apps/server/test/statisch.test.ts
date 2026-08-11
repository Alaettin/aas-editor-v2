import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/app.js";
import { readEnv } from "../src/env.js";
import { MCP_TOKEN } from "./helpers/app.js";

/**
 * Der Server liefert das gebaute Frontend aus.
 *
 * Die Zusagen, die dabei leicht auseinanderfallen: die API darf **niemals** HTML
 * zurueckgeben, und ein unbekannter Pfad muss die Anwendung liefern, sonst funktioniert
 * kein Neuladen auf einer Unterseite.
 */

const MIGRATIONS = fileURLToPath(new URL("../drizzle", import.meta.url));

const RUMPF = "<!doctype html><title>AXON Studio</title>";

let datenDir: string;
let webDir: string;

function umgebung() {
  return readEnv({
    AUTH_USERNAME: "pruefer",
    AUTH_PASSWORD: "geheim-genug",
    SESSION_SECRET: "test-geheimnis-lang-genug",
    MCP_TOKEN,
    DATA_DIR: datenDir,
    LOG_LEVEL: "silent",
  } as NodeJS.ProcessEnv);
}

beforeEach(() => {
  datenDir = mkdtempSync(join(tmpdir(), "aas-statisch-daten-"));
  webDir = mkdtempSync(join(tmpdir(), "aas-statisch-web-"));
});

afterEach(() => {
  rmSync(datenDir, { recursive: true, force: true });
  rmSync(webDir, { recursive: true, force: true });
});

describe("Statische Auslieferung", () => {
  it("liefert die Anwendung und faellt auf sie zurueck", async () => {
    writeFileSync(join(webDir, "index.html"), RUMPF, "utf8");
    mkdirSync(join(webDir, "assets"));
    writeFileSync(join(webDir, "assets", "index-abc123.js"), "export const a = 1;", "utf8");

    const gebaut = await buildServer(umgebung(), MIGRATIONS, webDir);
    try {
      const wurzel = await gebaut.app.inject({
        method: "GET",
        url: "/",
        headers: { accept: "text/html" },
      });
      expect(wurzel.statusCode).toBe(200);
      expect(wurzel.body).toContain("AXON Studio");
      expect(wurzel.headers["cache-control"]).toBe("no-cache");

      // Eine Unterseite existiert als Datei nicht. Ohne Fallback scheiterte jedes
      // Neuladen und jeder geteilte Link auf eine Route.
      const unterseite = await gebaut.app.inject({
        method: "GET",
        url: "/projekte",
        headers: { accept: "text/html" },
      });
      expect(unterseite.statusCode).toBe(200);
      expect(unterseite.body).toContain("AXON Studio");

      // Gehashte Dateien duerfen dauerhaft im Cache liegen, sonst laedt jeder Aufruf
      // dasselbe Bundle erneut.
      const asset = await gebaut.app.inject({ method: "GET", url: "/assets/index-abc123.js" });
      expect(asset.statusCode).toBe(200);
      expect(asset.headers["cache-control"]).toContain("immutable");
    } finally {
      await gebaut.close();
    }
  });

  it("antwortet auf einen unbekannten API-Pfad mit JSON, nicht mit HTML", async () => {
    writeFileSync(join(webDir, "index.html"), RUMPF, "utf8");

    const gebaut = await buildServer(umgebung(), MIGRATIONS, webDir);
    try {
      const antwort = await gebaut.app.inject({
        method: "GET",
        url: "/api/gibtsnicht",
        // Genau der harte Fall: ein Browser fragt nach HTML, es ist aber eine API-Adresse.
        headers: { accept: "text/html" },
      });
      expect(antwort.statusCode).toBe(404);
      expect(antwort.headers["content-type"]).toContain("application/json");
      expect(antwort.json<{ code: string }>().code).toBe("route-unbekannt");
    } finally {
      await gebaut.close();
    }
  });

  it("startet auch ohne gebautes Frontend", async () => {
    // Der Entwicklungsbetrieb: Vite liefert die Oberflaeche, apps/web/dist gibt es nicht.
    const gebaut = await buildServer(umgebung(), MIGRATIONS, join(webDir, "fehlt"));
    try {
      const gesund = await gebaut.app.inject({ method: "GET", url: "/api/health" });
      expect(gesund.statusCode).toBe(200);
    } finally {
      await gebaut.close();
    }
  });
});
