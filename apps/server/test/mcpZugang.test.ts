import { afterEach, describe, expect, it } from "vitest";
import { readEnv } from "../src/env.js";
import { ausgabe, entwuerfe } from "../src/services/ablage.js";
import { MCP_TOKEN, startTestServer, type TestServer } from "./helpers/app.js";

/**
 * Die Tuer des MCP-Zugangs.
 *
 * Geprueft wird hier die Tuer, nicht das, was dahinter steht: dass ohne Ausweis nichts
 * geht, dass die Aufforderung so aussieht, wie ein Klient sie lesen kann, und dass ein
 * Eintrag nur dem gehoert, der ihn angelegt hat.
 *
 * **Der OAuth-Weg fehlt hier mit Absicht.** Er verlangt einen erreichbaren Hub: Entdeckung,
 * JWKS, ein echtes Token. Nachgebaut prueft er die Attrappe, und mit dem echten Hub haenge
 * jeder Lauf an einem fremden Dienst. Er ist gegen den laufenden Dienst zu pruefen, und der
 * Beweis dafuer ist eine verbundene Verbindung in claude.ai, kein gruener Haken hier.
 */

const HUB = "https://acbkhrfzeyixxdbcbnah.supabase.co/auth/v1";
const CLIENT = "352122ca-57bc-46f7-97c5-0dc216cef6e9";

/** Ein Server mit OIDC in der Konfiguration, ohne dass ein Hub laufen muesste. */
const MIT_HUB = {
  AUTH_MODE: "oidc",
  OIDC_ISSUER: HUB,
  OIDC_CLIENT_ID: CLIENT,
  OIDC_CLIENT_SECRET: "geheim",
  OIDC_REDIRECT_URI: "http://localhost:5273/api/auth/callback",
  MCP_CLIENTS: CLIENT,
};

let server: TestServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function starte(overrides: Record<string, string> = {}): Promise<TestServer> {
  server = await startTestServer(overrides);
  return server;
}

/**
 * Die Adresse, die `app.inject()` meldet.
 *
 * Der Doppelpunkt-80 ist eine Eigenheit von inject und kein Fehler im Server: ohne echten
 * Sockel setzt Fastify den Host so zusammen. Im Betrieb steht dort der Hostname des
 * Anrufers, und hinter Caddy schlaegt ihn ohnehin `PUBLIC_BASE_URL`.
 */
const WURZEL = "http://localhost:80";

const RUMPF = { jsonrpc: "2.0", id: 1, method: "tools/list" };
const KOPF = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

describe("Ohne Ausweis", () => {
  it("weist den Werkzeugaufruf mit 401 ab und fordert nach RFC 6750 auf", async () => {
    const { app } = await starte(MIT_HUB);
    const antwort = await app.inject({
      method: "POST",
      url: "/api/mcp",
      headers: KOPF,
      payload: RUMPF,
    });

    expect(antwort.statusCode).toBe(401);
    const aufforderung = String(antwort.headers["www-authenticate"]);
    /*
     * Beide Angaben, nicht nur der Statuscode. Ohne `resource_metadata` findet claude.ai
     * den Aussteller nicht und meldet "Couldn't reach the MCP server", obwohl der Server
     * tadellos antwortet; das ist der teuerste Fehler in diesem ganzen Ablauf.
     */
    expect(aufforderung).toContain(
      `resource_metadata="${WURZEL}/.well-known/oauth-protected-resource/api/mcp"`,
    );
    expect(aufforderung).toContain('scope="openid profile email"');
    expect(aufforderung.startsWith("Bearer ")).toBe(true);
  });

  it("weist auch Upload und Download ab, nicht nur den Werkzeugaufruf", async () => {
    const { app } = await starte(MIT_HUB);
    const hochladen = await app.inject({ method: "POST", url: "/api/mcp/anhaenge" });
    const herunterladen = await app.inject({
      method: "GET",
      url: `/api/mcp/dateien/${"a".repeat(43)}`,
    });
    expect(hochladen.statusCode).toBe(401);
    expect(herunterladen.statusCode).toBe(401);
  });

  it("nennt keinen Grund, an dem sich ein Token unterscheiden liesse", async () => {
    const { app } = await starte(MIT_HUB);
    const rufe = async (ausweis: string | undefined) =>
      app.inject({
        method: "POST",
        url: "/api/mcp",
        headers: ausweis === undefined ? KOPF : { ...KOPF, authorization: ausweis },
        payload: RUMPF,
      });

    // Fehlend, verunstaltet, fremdes Verfahren und ein Token, das nur um ein Zeichen
    // danebenliegt: vier verschiedene Gruende, eine Antwort.
    const antworten = await Promise.all([
      rufe(undefined),
      rufe("Bearer nicht-einmal-ein-jwt"),
      rufe(`Basic ${Buffer.from("a:b").toString("base64")}`),
      rufe(`Bearer ${MCP_TOKEN.slice(0, -1)}x`),
    ]);

    for (const antwort of antworten) {
      expect(antwort.statusCode).toBe(401);
      expect(antwort.json()).toEqual(antworten[0]?.json());
    }
  });
});

describe("Mit festem Token", () => {
  it("laesst den Werkzeugaufruf durch", async () => {
    const { app } = await starte();
    const antwort = await app.inject({
      method: "POST",
      url: "/api/mcp",
      headers: { ...KOPF, authorization: `Bearer ${MCP_TOKEN}` },
      payload: RUMPF,
    });
    expect(antwort.statusCode).toBe(200);
    expect((antwort.json() as { result: { tools: unknown[] } }).result.tools).toHaveLength(10);
  });

  it("nimmt Bearer ohne Ruecksicht auf Gross- und Kleinschreibung", async () => {
    const { app } = await starte();
    const antwort = await app.inject({
      method: "POST",
      url: "/api/mcp",
      headers: { ...KOPF, authorization: `bEaReR   ${MCP_TOKEN}` },
      payload: RUMPF,
    });
    expect(antwort.statusCode).toBe(200);
  });
});

describe("Die Metadaten nach RFC 9728", () => {
  it("stehen unter beiden Pfaden und nennen Zugang und Aussteller", async () => {
    const { app } = await starte(MIT_HUB);
    for (const pfad of [
      "/.well-known/oauth-protected-resource/api/mcp",
      "/.well-known/oauth-protected-resource",
    ]) {
      const antwort = await app.inject({ method: "GET", url: pfad });
      expect(antwort.statusCode, pfad).toBe(200);
      expect(antwort.json()).toMatchObject({
        resource: `${WURZEL}/api/mcp`,
        authorization_servers: [HUB],
        scopes_supported: ["openid", "profile", "email"],
        bearer_methods_supported: ["header"],
      });
    }
  });

  it("nennt keinen offline_access: der ist der Wunsch des Klienten, nicht der Ressource", async () => {
    const { app } = await starte(MIT_HUB);
    const antwort = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource/api/mcp",
    });
    expect(antwort.json()["scopes_supported"]).not.toContain("offline_access");
  });

  /*
   * Der Punkt, an dem es sonst stumm scheitert: `resource` muss buchstabengleich die
   * Adresse sein, die der Nutzer eintippt. Hinter Caddy meldet der Klient einen anderen
   * Host als der Server hoert, deshalb schlaegt PUBLIC_BASE_URL den Host-Kopf.
   */
  it("folgt PUBLIC_BASE_URL und nicht dem Host-Kopf des Anrufers", async () => {
    const { app } = await starte({
      ...MIT_HUB,
      PUBLIC_BASE_URL: "https://axon-editor.sliplane.app",
    });
    const antwort = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource/api/mcp",
      headers: { host: "fremde-domain.example" },
    });
    expect(antwort.json()["resource"]).toBe("https://axon-editor.sliplane.app/api/mcp");
  });

  it("sind ohne Ausweis lesbar: ein Klient liest sie, bevor er ein Token hat", async () => {
    const { app } = await starte(MIT_HUB);
    const antwort = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource/api/mcp",
    });
    expect(antwort.statusCode).toBe(200);
  });
});

describe("Die Konfiguration", () => {
  const grund = {
    AUTH_USERNAME: "pruefer",
    AUTH_PASSWORD: "geheim-genug",
    SESSION_SECRET: "test-geheimnis-lang-genug",
    DATA_DIR: ".",
  };

  it("bricht den Start ab, wenn niemand hereinkaeme", () => {
    // Ein Server, der angemeldet sein will, aber keinen Weg herein kennt, sieht sonst
    // gesund aus und antwortet jedem mit 401.
    expect(() => readEnv(grund as NodeJS.ProcessEnv)).toThrow(/keinen Weg herein/);
  });

  it("bricht bei OIDC ohne MCP_CLIENTS ab: sonst genuegte jedes Sitzungstoken des Hubs", () => {
    const ohneClients = { ...grund, ...MIT_HUB, MCP_CLIENTS: "" };
    expect(() => readEnv(ohneClients as NodeJS.ProcessEnv)).toThrow(/keinen Weg herein/);
  });

  it("lehnt einen zu kurzen festen Token ab", () => {
    const kurz = { ...grund, MCP_TOKEN: "test" };
    expect(() => readEnv(kurz as NodeJS.ProcessEnv)).toThrow(/zu kurz/);
  });

  it("laesst den Verzicht zu, aber nur ausdruecklich", () => {
    const offen = readEnv({ ...grund, MCP_AUTH: "offen" } as NodeJS.ProcessEnv);
    expect(offen.mcpAuth).toBe(false);
    expect(() => readEnv({ ...grund, MCP_AUTH: "vielleicht" } as NodeJS.ProcessEnv)).toThrow(
      /MCP_AUTH/,
    );
  });
});

/*
 * Das Eigentum sitzt in der Ablage, und dort wird es geprueft. Ueber die Schnittstelle
 * ginge es nicht: durch die Tuer kommt in dieser Abnahme nur der feste Token, also immer
 * derselbe Eigentuemer, und ein Test, der zwei Nutzer braucht, haette keine zwei.
 */
describe("Eigentum an den Eintraegen", () => {
  const bytes = new TextEncoder().encode("{}");

  it("gibt einen Eintrag nur seinem Eigentuemer heraus", async () => {
    const { env } = await starte();
    const ablage = entwuerfe(env);
    const { token } = ablage.ablegen({
      bytes,
      dateiname: "entwurf.json",
      contentType: "application/json",
      eigentuemer: "nutzer-a",
    });

    expect(ablage.abrufen(token, "nutzer-a")).not.toBeNull();
    expect(ablage.abrufen(token, "nutzer-b")).toBeNull();
  });

  it("laesst einen Fremden weder ueberschreiben noch wegwerfen", async () => {
    const { env } = await starte();
    const ablage = entwuerfe(env);
    const { token } = ablage.ablegen({
      bytes,
      dateiname: "entwurf.json",
      contentType: "application/json",
      eigentuemer: "nutzer-a",
    });

    const fremd = new TextEncoder().encode('{"fremd":true}');
    expect(ablage.aktualisieren(token, "nutzer-b", fremd)).toBeNull();
    ablage.verwerfen(token, "nutzer-b");

    // Beides muss wirkungslos geblieben sein, nicht nur folgenlos gemeldet.
    const eigen = ablage.abrufen(token, "nutzer-a");
    expect(eigen?.bytes.toString("utf8")).toBe("{}");
  });

  it("gilt genauso fuer erzeugte Dateien: ein Link laesst sich nicht weitergeben", async () => {
    const { env } = await starte();
    const ablage = ausgabe(env);
    const { token } = ablage.ablegen({
      bytes,
      dateiname: "environment.json",
      contentType: "application/json",
      eigentuemer: "nutzer-a",
    });
    expect(ablage.abrufen(token, "nutzer-b")).toBeNull();
  });
});
