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
  readonly authUsername: string;
  readonly authPassword: string;
  readonly sessionSecret: string;
  readonly sessionTtlMs: number;
  readonly maxUploadBytes: number;
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

export function readEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const dataDir = resolve(source["DATA_DIR"] ?? "./data");
  const ttlHours = number("SESSION_TTL_HOURS", source["SESSION_TTL_HOURS"], 720);
  const maxUploadMb = number("MAX_UPLOAD_MB", source["MAX_UPLOAD_MB"], 50);

  return {
    port: number("PORT", source["PORT"], 3200),
    host: source["HOST"] ?? "0.0.0.0",
    logLevel: source["LOG_LEVEL"] ?? "info",
    production: source["NODE_ENV"] === "production",
    dataDir,
    dbPath: resolve(dataDir, "aas-editor.db"),
    attachmentDir: resolve(dataDir, "attachments"),
    authUsername: required("AUTH_USERNAME", source["AUTH_USERNAME"]),
    authPassword: required("AUTH_PASSWORD", source["AUTH_PASSWORD"]),
    sessionSecret: required("SESSION_SECRET", source["SESSION_SECRET"]),
    sessionTtlMs: ttlHours * 60 * 60 * 1000,
    maxUploadBytes: maxUploadMb * 1024 * 1024,
  };
}
