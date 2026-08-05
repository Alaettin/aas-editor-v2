import { randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { and, desc, eq, lt, or } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { projectVersions } from "../db/schema.js";
import { notFound } from "../errors.js";
import type { Json } from "./environment.js";
import { getProject, readEnvironment } from "./projects.js";
import { toPage, type Cursor, type Page, type PageQuery } from "./pagination.js";

/**
 * Versionen sind vollstaendige, komprimierte Schnappschuesse der ganzen Umgebung. Das ist
 * der eine Ort, an dem ein Blob richtig ist (Plan Abschnitt 9): eine Version wird nie
 * teilweise gelesen, nur ganz wiederhergestellt.
 */

export interface VersionSummary {
  readonly id: string;
  readonly projectId: string;
  readonly revision: number;
  readonly label: string | null;
  readonly reason: string;
  readonly snapshotBytes: number;
  readonly nodeCount: number;
  readonly metamodelVersion: string;
  readonly createdAt: number;
}

export function createVersion(
  db: Db,
  projectId: string,
  options: { label?: string | null; reason?: string } = {},
): VersionSummary {
  const project = getProject(db, projectId);
  const environment = readEnvironment(db, projectId);
  const snapshot = gzipSync(Buffer.from(JSON.stringify(environment), "utf8"));

  const row = {
    id: randomUUID(),
    projectId,
    revision: project.revision,
    label: options.label ?? null,
    reason: options.reason ?? "manuell",
    snapshot,
    snapshotBytes: snapshot.byteLength,
    nodeCount: project.nodeCount,
    metamodelVersion: project.metamodelVersion,
    createdAt: Date.now(),
  };

  db.insert(projectVersions).values(row).run();
  return toSummary(row);
}

export function listVersions(db: Db, projectId: string, page: PageQuery): Page<VersionSummary> {
  const cursorWhere =
    page.cursor === null
      ? undefined
      : or(
          lt(projectVersions.createdAt, Number(page.cursor.k)),
          and(
            eq(projectVersions.createdAt, Number(page.cursor.k)),
            lt(projectVersions.id, page.cursor.i),
          ),
        );

  const rows = db
    .select({
      id: projectVersions.id,
      projectId: projectVersions.projectId,
      revision: projectVersions.revision,
      label: projectVersions.label,
      reason: projectVersions.reason,
      snapshotBytes: projectVersions.snapshotBytes,
      nodeCount: projectVersions.nodeCount,
      metamodelVersion: projectVersions.metamodelVersion,
      createdAt: projectVersions.createdAt,
    })
    .from(projectVersions)
    .where(and(eq(projectVersions.projectId, projectId), cursorWhere))
    .orderBy(desc(projectVersions.createdAt), desc(projectVersions.id))
    .limit(page.limit + 1)
    .all();

  return toPage(rows, page.limit, (row): Cursor => ({ k: row.createdAt, i: row.id }));
}

export function readVersion(
  db: Db,
  projectId: string,
  versionId: string,
): { version: VersionSummary; environment: Json } {
  const row = db
    .select()
    .from(projectVersions)
    .where(and(eq(projectVersions.projectId, projectId), eq(projectVersions.id, versionId)))
    .get();
  if (row === undefined) throw notFound("Version nicht gefunden.");

  const environment = JSON.parse(gunzipSync(row.snapshot).toString("utf8")) as Json;
  return { version: toSummary(row), environment };
}

function toSummary(row: Omit<VersionSummary, never> & { snapshot?: unknown }): VersionSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    revision: row.revision,
    label: row.label,
    reason: row.reason,
    snapshotBytes: row.snapshotBytes,
    nodeCount: row.nodeCount,
    metamodelVersion: row.metamodelVersion,
    createdAt: row.createdAt,
  };
}
