import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, lt, or } from "drizzle-orm";
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

  return toPage(rows.map(toSummary), page.limit, (row): Cursor => ({
    k: row.createdAt,
    i: row.id,
  }));
}

export function getProject(db: Db, id: string): ProjectRow {
  const row = db.select().from(projects).where(eq(projects.id, id)).get();
  if (row === undefined) throw notFound("projekt-nicht-gefunden", "Project not found.");
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
    if (current === undefined) throw notFound("projekt-nicht-gefunden", "Project not found.");

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
        "The server revision is newer than the expected one. Nothing was overwritten.",
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
    // Erst alles auf unreferenziert, dann die tatsaechlich verwendeten Pfade wieder
    // hoch. Ein `notInArray` ueber tausende Pfade waere dieselbe Variablengrenze wie
    // oben, und der Umweg ueber zwei Anweisungen kommt ohne aus.
    const paths = [...referenced];
    tx.update(files).set({ referenced: false }).where(eq(files.projectId, id)).run();
    for (const block of inBloecken(paths)) {
      tx.update(files)
        .set({ referenced: true })
        .where(and(eq(files.projectId, id), inArray(files.path, block)))
        .run();
    }
  });

  return toSummary(getProject(db, id));
}

export function deleteProject(db: Db, id: string): void {
  const result = db.delete(projects).where(eq(projects.id, id)).run();
  if (result.changes === 0) throw notFound("projekt-nicht-gefunden", "Project not found.");
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
        throw conflict("doppelte-id", `The id "${row.id}" occurs more than once.`, { id: row.id });
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
    for (const block of inBloecken(rows)) {
      tx.insert(table)
        .values(block.map((row) => ({ ...row, projectId, updatedAt: now })))
        .run();
    }
  }
}

/**
 * SQLite bindet je Anweisung hoechstens `SQLITE_MAX_VARIABLE_NUMBER` Werte, vorgabemaessig
 * 32.766. Bei sechs Spalten je Zeile reisst ein Modell mit einigen tausend Teilmodellen
 * das in einer einzigen `values([...])`-Anweisung. Zweihundert Zeilen je Block liegen
 * weit darunter und kosten gegenueber einem Rundumschlag nichts messbares.
 */
const BLOCK = 200;

function inBloecken<T>(werte: readonly T[]): T[][] {
  const bloecke: T[][] = [];
  for (let i = 0; i < werte.length; i += BLOCK) bloecke.push(werte.slice(i, i + BLOCK));
  return bloecke;
}
