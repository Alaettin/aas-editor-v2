import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, lt, notInArray, or } from "drizzle-orm";
import type { Db, Tx } from "../db/client.js";
import {
  conceptDescriptions,
  files,
  projects,
  shells,
  submodels,
  type ProjectRow,
} from "../db/schema.js";
import { conflict, notFound } from "../errors.js";
import {
  collectFilePaths,
  joinEnvironment,
  splitEnvironment,
  type IdentifiableSlot,
  type Json,
} from "./environment.js";
import { toPage, type Cursor, type Page, type PageQuery } from "./pagination.js";

const TABLE_FOR_SLOT = {
  assetAdministrationShells: shells,
  submodels,
  conceptDescriptions,
} as const satisfies Record<IdentifiableSlot, unknown>;

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly metamodelVersion: string;
  readonly sourceFormat: string;
  readonly revision: number;
  readonly nodeCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface SaveInput {
  readonly name?: string;
  readonly sourceFormat?: string;
  readonly metamodelVersion?: string;
  readonly nodeCount?: number;
  readonly environment: unknown;
}

function toSummary(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    metamodelVersion: row.metamodelVersion,
    sourceFormat: row.sourceFormat,
    revision: row.revision,
    nodeCount: row.nodeCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listProjects(db: Db, page: PageQuery): Page<ProjectSummary> {
  // Sortiert nach created_at, nie nach updated_at: sonst verschiebt ein Speichervorgang
  // in einem anderen Tab die Seitengrenzen unter dem Blaettern weg.
  const where =
    page.cursor === null
      ? undefined
      : or(
          lt(projects.createdAt, Number(page.cursor.k)),
          and(eq(projects.createdAt, Number(page.cursor.k)), lt(projects.id, page.cursor.i)),
        );

  const rows = db
    .select()
    .from(projects)
    .where(where)
    .orderBy(desc(projects.createdAt), desc(projects.id))
    .limit(page.limit + 1)
    .all();

  return toPage(rows.map(toSummary), page.limit, (row): Cursor => ({ k: row.createdAt, i: row.id }));
}

export function getProject(db: Db, id: string): ProjectRow {
  const row = db.select().from(projects).where(eq(projects.id, id)).get();
  if (row === undefined) throw notFound("Projekt nicht gefunden.");
  return row;
}

export function readEnvironment(db: Db, projectId: string): Json {
  const rows = {} as Record<IdentifiableSlot, { json: string }[]>;
  for (const [slot, table] of Object.entries(TABLE_FOR_SLOT) as [
    IdentifiableSlot,
    typeof shells,
  ][]) {
    rows[slot] = db
      .select({ json: table.json })
      .from(table)
      .where(eq(table.projectId, projectId))
      .orderBy(asc(table.sortIndex), asc(table.rowId))
      .all();
  }
  return joinEnvironment(getProject(db, projectId).environmentData, rows);
}

export function createProject(
  db: Db,
  input: SaveInput & { name: string },
): { project: ProjectSummary; environment: Json } {
  const now = Date.now();
  const id = randomUUID();
  const split = splitEnvironment(input.environment);
  assertUniqueIds(split);

  db.transaction((tx) => {
    tx.insert(projects)
      .values({
        id,
        name: input.name,
        metamodelVersion: input.metamodelVersion ?? "3.1",
        sourceFormat: input.sourceFormat ?? "json",
        environmentData: split.environmentData,
        revision: 1,
        nodeCount: input.nodeCount ?? 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    insertIdentifiables(tx, id, split, now);
  });

  return { project: toSummary(getProject(db, id)), environment: readEnvironment(db, id) };
}

/**
 * Speichert einen neuen Stand. Optimistisches Sperren ueber den Revisionszaehler:
 * das UPDATE greift nur, wenn die erwartete Revision noch die aktuelle ist.
 */
export function saveProject(
  db: Db,
  id: string,
  expectedRevision: number,
  input: SaveInput,
): ProjectSummary {
  const now = Date.now();
  const split = splitEnvironment(input.environment);
  assertUniqueIds(split);
  const referenced = collectFilePaths(input.environment as Json);

  db.transaction((tx) => {
    const current = tx.select().from(projects).where(eq(projects.id, id)).get();
    if (current === undefined) throw notFound("Projekt nicht gefunden.");

    const updated = tx
      .update(projects)
      .set({
        revision: current.revision + 1,
        updatedAt: now,
        environmentData: split.environmentData,
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.sourceFormat === undefined ? {} : { sourceFormat: input.sourceFormat }),
        ...(input.metamodelVersion === undefined
          ? {}
          : { metamodelVersion: input.metamodelVersion }),
        ...(input.nodeCount === undefined ? {} : { nodeCount: input.nodeCount }),
      })
      .where(and(eq(projects.id, id), eq(projects.revision, expectedRevision)))
      .run();

    if (updated.changes === 0) {
      throw conflict(
        "revision-konflikt",
        "Der Serverstand ist neuer als der eigene. Nichts wurde ueberschrieben.",
        { aktuelleRevision: current.revision, aktualisiertAm: current.updatedAt },
      );
    }

    // Vollersatz statt Differenzabgleich: das ist eine einzige Transaktion, und
    // Geisterzeilen aus einem halb abgeglichenen Stand sind damit ausgeschlossen.
    for (const table of Object.values(TABLE_FOR_SLOT)) {
      tx.delete(table).where(eq(table.projectId, id)).run();
    }
    insertIdentifiables(tx, id, split, now);

    // Anhaenge nicht loeschen, nur als unreferenziert markieren: sonst verliert eine
    // aeltere Version ihre Bytes.
    const paths = [...referenced];
    tx.update(files)
      .set({ referenced: false })
      .where(
        paths.length === 0
          ? eq(files.projectId, id)
          : and(eq(files.projectId, id), notInArray(files.path, paths)),
      )
      .run();
    if (paths.length > 0) {
      tx.update(files)
        .set({ referenced: true })
        .where(and(eq(files.projectId, id), inArray(files.path, paths)))
        .run();
    }
  });

  return toSummary(getProject(db, id));
}

export function deleteProject(db: Db, id: string): void {
  const result = db.delete(projects).where(eq(projects.id, id)).run();
  if (result.changes === 0) throw notFound("Projekt nicht gefunden.");
}

/**
 * Doppelte `id` im selben Projekt vorab abfangen. Der partielle Unique-Index in der
 * Datenbank wuerde es auch bemerken, aber mit einer Meldung, die niemandem sagt, welche
 * id gemeint ist. Geprueft wird ausschliesslich `id`, nie `idShort`.
 */
function assertUniqueIds(split: ReturnType<typeof splitEnvironment>): void {
  const gesehen = new Set<string>();
  for (const slot of Object.keys(TABLE_FOR_SLOT) as IdentifiableSlot[]) {
    for (const row of split.rows[slot]) {
      if (row.id === "") continue;
      if (gesehen.has(row.id)) {
        throw conflict("doppelte-id", `Die id "${row.id}" kommt mehrfach vor.`, { id: row.id });
      }
      gesehen.add(row.id);
    }
  }
}

function insertIdentifiables(
  tx: Tx,
  projectId: string,
  split: ReturnType<typeof splitEnvironment>,
  now: number,
): void {
  for (const [slot, table] of Object.entries(TABLE_FOR_SLOT) as [
    IdentifiableSlot,
    typeof shells,
  ][]) {
    const rows = split.rows[slot];
    if (rows.length === 0) continue;
    tx.insert(table)
      .values(rows.map((row) => ({ ...row, projectId, updatedAt: now })))
      .run();
  }
}
