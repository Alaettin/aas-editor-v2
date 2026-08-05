import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { files, type FileRow } from "../db/schema.js";
import type { ServerEnv } from "../env.js";
import { notFound } from "../errors.js";

/**
 * Anhaenge liegen im Volume, die Zeile in der Datenbank haelt Paketpfad, Groesse und
 * Pruefsumme (Plan Abschnitt 9). Der Ablagename ist die Pruefsumme: gleiche Bytes belegen
 * denselben Platz, und ein abgebrochener Upload hinterlaesst keine halbe Datei unter einem
 * Namen, den jemand fuer gueltig haelt.
 */

export interface FileInfo {
  readonly id: string;
  readonly path: string;
  readonly contentType: string;
  readonly size: number;
  readonly sha256: string;
  readonly role: string;
  readonly referenced: boolean;
  readonly createdAt: number;
}

function toInfo(row: FileRow): FileInfo {
  return {
    id: row.id,
    path: row.path,
    contentType: row.contentType,
    size: row.size,
    sha256: row.sha256,
    role: row.role,
    referenced: row.referenced,
    createdAt: row.createdAt,
  };
}

export function listFiles(db: Db, projectId: string): FileInfo[] {
  return db
    .select()
    .from(files)
    .where(eq(files.projectId, projectId))
    .orderBy(asc(files.path))
    .all()
    .map(toInfo);
}

export function storeFile(
  db: Db,
  env: ServerEnv,
  projectId: string,
  input: { path: string; contentType: string; bytes: Buffer; role?: string },
): FileInfo {
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const storagePath = join("attachments", projectId, sha256);
  const absolute = resolve(env.dataDir, storagePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, input.bytes);

  const now = Date.now();
  const row = {
    id: randomUUID(),
    projectId,
    path: input.path,
    contentType: input.contentType,
    size: input.bytes.byteLength,
    sha256,
    storagePath,
    role: input.role ?? "anhang",
    referenced: true,
    createdAt: now,
  };

  // Derselbe Paketpfad wird ersetzt, nicht verdoppelt: der Pfad ist der fachliche
  // Schluessel, das File-Element im Modell zeigt genau darauf.
  db.insert(files)
    .values(row)
    .onConflictDoUpdate({
      target: [files.projectId, files.path],
      set: {
        contentType: row.contentType,
        size: row.size,
        sha256: row.sha256,
        storagePath: row.storagePath,
        role: row.role,
        referenced: true,
        createdAt: now,
      },
    })
    .run();

  const stored = db
    .select()
    .from(files)
    .where(and(eq(files.projectId, projectId), eq(files.path, input.path)))
    .get();
  if (stored === undefined)
    throw notFound("anhang-nicht-abgelegt", "The attachment could not be stored.");
  return toInfo(stored);
}

export function readFile(
  db: Db,
  env: ServerEnv,
  projectId: string,
  fileId: string,
): { info: FileInfo; bytes: Buffer } {
  const row = db
    .select()
    .from(files)
    .where(and(eq(files.projectId, projectId), eq(files.id, fileId)))
    .get();
  if (row === undefined) throw notFound("anhang-nicht-gefunden", "Attachment not found.");

  try {
    return { info: toInfo(row), bytes: readFileSync(resolve(env.dataDir, row.storagePath)) };
  } catch {
    throw notFound("anhang-ohne-bytes", "The bytes for this attachment are missing on disk.");
  }
}

export function deleteFile(db: Db, projectId: string, fileId: string): void {
  // Die Bytes bleiben liegen: eine aeltere Version kann noch auf sie zeigen. Aufgeraeumt
  // wird beim Loeschen des Projekts, nicht bei einer einzelnen Zeile.
  const result = db
    .delete(files)
    .where(and(eq(files.projectId, projectId), eq(files.id, fileId)))
    .run();
  if (result.changes === 0) throw notFound("anhang-nicht-gefunden", "Attachment not found.");
}
