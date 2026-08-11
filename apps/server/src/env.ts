import { resolve } from "node:path";

/**
 * Konfiguration aus der Umgebung, einmal gelesen und geprueft.
 *
 * Fehlt ein Pflichtwert, bricht der Start ab. Ein Server, der mit leerem
 * SESSION_SECRET laeuft, signiert Sitzungen mit nichts und faellt erst auf, wenn
 * jemand das Cookie faelscht.
 */

export interface ServerEnv {
  readonly port: number;
  readonly host: string;
  readonly logLevel: string;
  readonly production: boolean;
  /** Verzeichnis fuer die SQLite-Datei und die Anhaenge */
  readonly dataDir: string;
  readonly dbPath: string;
  readonly attachmentDir: string;
  /**
   * Woher die Identitaet kommt.
   *
   * `passwort` ist der alte Weg und bleibt die Rueckfallebene: geht am Hub etwas schief,
   * ist der Editor sonst fuer niemanden mehr erreichbar.
   */
  readonly authModus: "passwort" | "oidc";
  readonly authUsername: string;
  readonly authPassword: string;
  /** Nur bei `authModus === "oidc"` gesetzt. */
  readonly oidc: {
    readonly aussteller: string;
    readonly clientId: string;
    readonly clientSecret: string;
    readonly rueckweg: string;
  } | null;
  readonly sessionSecret: string;
  readonly sessionTtlMs: number;
  readonly maxUploadBytes: number;
  /**
   * Rechnernamen, die der MCP-Server abrufen darf, ohne dass seine Bereichspruefung
   * mitredet. Genauer Name oder `*.suffix`.
   *
   * Der Ausweg fuer den Fall, dass ein Herstellerportal hinter einem Adressraum liegt, den
   * der Zaun fuer intern haelt, und die Klaerung laenger dauert als die Arbeit. Er hebelt
   * **nur** die Bereichspruefung aus: https, Groessengrenzen, Typenliste und die erneute
   * Pruefung jedes Weiterleitungssprungs gelten weiter. Leer heisst: nichts freigestellt.
   */
  readonly mcpNetzErlaubt: readonly string[];
  /**
   * Verlangt der MCP-Zugang eine Anmeldung? Vorgabe ja.
   *
   * `MCP_AUTH=offen` ist der ausdrueckliche Verzicht fuer lokale Arbeit und wird beim Start
   * als Warnung protokolliert. Die Vorgabe steht auf "an", weil die andere Richtung, ein
   * vergessener Wert und ein offener Zugang, unbemerkt bleibt.
   */
  readonly mcpAuth: boolean;
  /**
   * Der feste Bearer-Token fuer Shell und Abnahme, oder `null`.
   *
   * Claude Code kann den OAuth-Weg nicht gehen: der Hub bietet weder Dynamic Client
   * Registration noch Client-ID-Metadata-Dokumente. Siehe `mcp/zugang.ts`.
   */
  readonly mcpToken: string | null;
  /**
   * Die OAuth-Clients, deren Zugriffstoken der MCP-Zugang annimmt.
   *
   * Der eigentliche Zaun. Bei Supabase steht in `aud` immer `authenticated`, die von der
   * MCP-Spezifikation verlangte Bindung an den Empfaenger laeuft deshalb ueber `client_id`.
   * Leer heisst: kein Token des Hubs wird angenommen, nur der feste Token.
   */
  readonly mcpClients: readonly string[];
  /**
   * Die oeffentliche Basis-Adresse, ohne abschliessenden Schraegstrich, oder `null`.
   *
   * Gesetzt, wird sie fuer die Download-Links des MCP-Servers und die Basis-Adresse des
   * Repositories genommen, statt den vom Klienten gemeldeten `Host`-Kopf zu vertrauen. Der
   * Host ist Nutzerdaten: ein untergeschobener Aufruf bekaeme sonst Links auf eine fremde
   * Domain angezeigt (Sicherheitsaudit 11.08.2026, niedriger Befund).
   */
  readonly publicBaseUrl: string | null;
}

export class ConfigError extends Error {}

function required(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    throw new ConfigError(
      `${name} fehlt. Ohne diesen Wert startet der Server nicht, siehe .env.example.`,
    );
  }
  return value;
}

function number(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ConfigError(`${name} muss eine positive Zahl sein, gelesen wurde "${value}".`);
  }
  return parsed;
}

/** Eine kommagetrennte Aufzaehlung, kleingeschrieben und ohne leere Glieder. */
function liste(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((eintrag) => eintrag.trim().toLowerCase())
    .filter((eintrag) => eintrag !== "");
}

export function readEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const dataDir = resolve(source["DATA_DIR"] ?? "./data");
  /*
   * Vorgabe 12 Stunden (Sicherheitsaudit 11.08.2026, mittlerer Befund). Der Editor liest je
   * Aufruf nur sein eigenes Cookie und fragt den Hub nicht; nimmt der Hub jemandem die
   * Freischaltung, wirkt das erst, wenn die Editor-Sitzung ablaeuft. Kurz genug, dass ein
   * Entzug am selben Tag greift, lang genug, dass niemand mitten in der Arbeit hinausfliegt.
   * Vorher 720 Stunden (30 Tage). Auf dem Sliplane-Dienst steht der Wert fest gesetzt und
   * muss dort von Hand gesenkt werden.
   */
  const ttlHours = number("SESSION_TTL_HOURS", source["SESSION_TTL_HOURS"], 12);
  const maxUploadMb = number("MAX_UPLOAD_MB", source["MAX_UPLOAD_MB"], 50);

  const rohModus = source["AUTH_MODE"] ?? "passwort";
  if (rohModus !== "passwort" && rohModus !== "oidc") {
    throw new ConfigError(`AUTH_MODE muss "passwort" oder "oidc" sein, gelesen wurde "${rohModus}".`);
  }
  const authModus = rohModus;

  /*
   * Im OIDC-Betrieb sind die vier Werte Pflicht, und zwar hier und nicht erst beim ersten
   * Anmeldeversuch. Ein Server, der ohne Client-Geheimnis startet, sieht gesund aus und
   * scheitert erst, wenn sich jemand anmelden will.
   */
  const oidc =
    authModus === "oidc"
      ? {
          aussteller: required("OIDC_ISSUER", source["OIDC_ISSUER"]),
          clientId: required("OIDC_CLIENT_ID", source["OIDC_CLIENT_ID"]),
          clientSecret: required("OIDC_CLIENT_SECRET", source["OIDC_CLIENT_SECRET"]),
          rueckweg: required("OIDC_REDIRECT_URI", source["OIDC_REDIRECT_URI"]),
        }
      : null;

  /*
   * Benutzername und Passwort sind nur im Passwortbetrieb Pflicht. Sie im OIDC-Betrieb
   * weiter zu verlangen hiesse, ein Passwort zu pflegen, das niemand mehr benutzt, und das
   * ist genau die Art Zugangsdatum, die jahrelang unveraendert stehen bleibt.
   */
  const authUsername = authModus === "passwort"
    ? required("AUTH_USERNAME", source["AUTH_USERNAME"])
    : (source["AUTH_USERNAME"] ?? "");
  const authPassword = authModus === "passwort"
    ? required("AUTH_PASSWORD", source["AUTH_PASSWORD"])
    : (source["AUTH_PASSWORD"] ?? "");

  const rohMcpAuth = source["MCP_AUTH"] ?? "an";
  if (rohMcpAuth !== "an" && rohMcpAuth !== "offen") {
    throw new ConfigError(`MCP_AUTH muss "an" oder "offen" sein, gelesen wurde "${rohMcpAuth}".`);
  }
  const mcpAuth = rohMcpAuth === "an";

  /*
   * Ein kurzer Token ist kein Token. 32 Zeichen sind die Untergrenze, unter der ein
   * Wert erratbar wird, und ein `MCP_TOKEN=test` in einer Produktionsumgebung soll den
   * Start abbrechen und nicht jahrelang unbemerkt offen stehen.
   */
  const rohMcpToken = source["MCP_TOKEN"]?.trim();
  const mcpToken = rohMcpToken === undefined || rohMcpToken === "" ? null : rohMcpToken;
  if (mcpToken !== null && mcpToken.length < 32) {
    throw new ConfigError(
      `MCP_TOKEN ist mit ${String(mcpToken.length)} Zeichen zu kurz, mindestens 32 sind noetig.`,
    );
  }

  const mcpClients = liste(source["MCP_CLIENTS"]);

  /*
   * Ein Server, der niemanden hereinlassen kann, soll nicht gesund aussehen. Dieselbe
   * Haltung wie bei den vier OIDC-Pflichtwerten weiter oben.
   */
  if (mcpAuth && mcpToken === null && (oidc === null || mcpClients.length === 0)) {
    throw new ConfigError(
      "MCP_AUTH=an, aber es gibt keinen Weg herein: entweder MCP_TOKEN setzen oder " +
        "AUTH_MODE=oidc zusammen mit MCP_CLIENTS.",
    );
  }

  return {
    port: number("PORT", source["PORT"], 3200),
    host: source["HOST"] ?? "0.0.0.0",
    logLevel: source["LOG_LEVEL"] ?? "info",
    production: source["NODE_ENV"] === "production",
    dataDir,
    dbPath: resolve(dataDir, "aas-editor.db"),
    attachmentDir: resolve(dataDir, "attachments"),
    authModus,
    authUsername,
    authPassword,
    oidc,
    sessionSecret: required("SESSION_SECRET", source["SESSION_SECRET"]),
    sessionTtlMs: ttlHours * 60 * 60 * 1000,
    maxUploadBytes: maxUploadMb * 1024 * 1024,
    mcpNetzErlaubt: liste(source["MCP_NETZ_ERLAUBT"]),
    mcpAuth,
    mcpToken,
    mcpClients,
    publicBaseUrl: (() => {
      const roh = source["PUBLIC_BASE_URL"]?.trim();
      return roh === undefined || roh === "" ? null : roh.replace(/\/+$/, "");
    })(),
  };
}
