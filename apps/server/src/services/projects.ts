import { randomUUID } from "node:crypto";
import { normalize } from "@aas-editor/core";
import { validate } from "@aas-editor/core/validation";
import { and, asc, count, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import type { Db, Tx } from "../db/client.js";
import {
  conceptDescriptions,
  files,
  projects,
  shells,
  submodels,
  type ProjectRow,
} from "../db/schema.js";
import { badRequest, conflict, notFound } from "../errors.js";
import {
  collectFilePaths,
  joinEnvironment,
  splitEnvironment,
  type IdentifiableSlot,
  type Json,
} from "./environment.js";
import { MAX_LIMIT } from "./pagination.js";

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
  /** Anzahl der Teilmodelle, fuer die Spalte im Einstieg. */
  readonly submodelCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Wonach der Einstieg sortieren darf. Nichts anderes kommt aus der Abfrage durch. */
export const SORT_FELDER = [
  "name",
  "nodeCount",
  "submodelCount",
  "revision",
  "updatedAt",
  "createdAt",
] as const;
export type SortFeld = (typeof SORT_FELDER)[number];

export interface ProjectQuery {
  readonly limit: number;
  readonly offset: number;
  /** Namenssuche, Teiltreffer. */
  readonly q: string | null;
  /** Untergrenze auf `updatedAt`, vom Klienten in seiner Zeitzone gerechnet. */
  readonly seit: number | null;
  readonly sort: SortFeld;
  readonly dir: "asc" | "desc";
}

export interface ProjectPage {
  readonly items: ProjectSummary[];
  readonly total: number;
}

export interface SaveInput {
  readonly name?: string;
  readonly sourceFormat?: string;
  readonly metamodelVersion?: string;
  readonly nodeCount?: number;
  readonly environment: unknown;
}

function toSummary(row: ProjectRow, submodelCount: number): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    metamodelVersion: row.metamodelVersion,
    sourceFormat: row.sourceFormat,
    revision: row.revision,
    nodeCount: row.nodeCount,
    submodelCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Die Teilmodellzahl als abhaengige Unterabfrage statt als zweiter Rundgang. Nur so laesst
 * sich auch **nach** ihr sortieren, und die Seite bleibt eine einzige Anweisung.
 *
 * Die Namen stehen hier ausgeschrieben, und das muss so sein: Drizzle setzt eine Spalte in
 * einem `sql`-Fragment **ohne** ihre Tabelle ein. Aus `${submodels.projectId} =
 * ${projects.id}` wird `"project_id" = "id"`, und innerhalb der Unterabfrage ist `"id"`
 * die id des Teilmodells. Die Bedingung waere immer falsch, und jede Zeile meldete null.
 */
const SUBMODEL_COUNT = sql<number>`(select count(*) from "submodels" where "submodels"."project_id" = "projects"."id")`;

/**
 * Suchmuster fuer LIKE. Prozent und Unterstrich sind dort Platzhalter und muessen entwertet
 * werden, sonst findet die Eingabe "_" jeden Namen. SQLite faltet bei LIKE nur ASCII, ein
 * "STRASSE" trifft also "Strasse", aber nicht "STRASSE" gegen "straße".
 */
function namensMuster(q: string): SQL {
  const muster = `%${q.replace(/[\\%_]/g, (zeichen) => `\\${zeichen}`)}%`;
  return sql`${projects.name} like ${muster} escape '\\'`;
}

function bedingungen(query: ProjectQuery): SQL | undefined {
  const teile: SQL[] = [];
  if (query.q !== null) teile.push(namensMuster(query.q));
  if (query.seit !== null) teile.push(gte(projects.updatedAt, query.seit));
  return teile.length === 0 ? undefined : and(...teile);
}

const SORT_SPALTE = {
  name: projects.name,
  nodeCount: projects.nodeCount,
  submodelCount: SUBMODEL_COUNT,
  revision: projects.revision,
  updatedAt: projects.updatedAt,
  createdAt: projects.createdAt,
} as const satisfies Record<SortFeld, unknown>;

/**
 * Blaettert ueber Offset, nicht ueber einen Cursor wie der Rest des Servers.
 *
 * Der Einstieg zeigt Seitenzahlen und "1 bis 8 von 24", und beides gibt es ohne Gesamtzahl
 * nicht. Ausserdem darf hier nach jeder Spalte sortiert werden, ein Keyset-Cursor muesste
 * dafuer je Sortierung anders aussehen. Versionen und Teilmodelle blaettern unveraendert
 * ueber `services/pagination.ts`.
 */
export function listProjects(db: Db, query: ProjectQuery): ProjectPage {
  const where = bedingungen(query);
  const richtung = query.dir === "asc" ? asc : desc;

  const rows = db
    .select({ row: projects, submodelCount: SUBMODEL_COUNT })
    .from(projects)
    .where(where)
    // Die Zeilenkennung als Zweitschluessel: ohne sie ist die Reihenfolge bei gleichem
    // Sortierwert unbestimmt, und dieselbe Zeile erschiene auf zwei Seiten.
    .orderBy(richtung(SORT_SPALTE[query.sort]), richtung(projects.id))
    .limit(query.limit)
    .offset(query.offset)
    .all();

  const total = db.select({ anzahl: count() }).from(projects).where(where).get()?.anzahl ?? 0;

  return { items: rows.map((row) => toSummary(row.row, row.submodelCount)), total };
}

/** Die Zusammenfassung eines einzelnen Projekts, samt Teilmodellzahl. */
export function summaryOf(db: Db, id: string): ProjectSummary {
  const row = getProject(db, id);
  const anzahl =
    db.select({ anzahl: count() }).from(submodels).where(eq(submodels.projectId, id)).get()
      ?.anzahl ?? 0;
  return toSummary(row, anzahl);
}

function alsZahl(wert: unknown, code: string, text: string): number {
  const zahl = Number(wert);
  if (!Number.isInteger(zahl) || zahl < 0) throw badRequest(code, text);
  return zahl;
}

/**
 * Wertet die Abfrage des Einstiegs aus. Jede unerlaubte Angabe bekommt einen eigenen Code:
 * darauf uebersetzt die Oberflaeche, ein Sammelcode koennte das nicht.
 */
export function parseProjectQuery(query: Record<string, unknown>): ProjectQuery {
  const limit =
    query["limit"] === undefined
      ? 25
      : alsZahl(query["limit"], "ungueltiges-limit", `limit must be between 1 and ${MAX_LIMIT}.`);
  if (limit < 1 || limit > MAX_LIMIT) {
    throw badRequest("ungueltiges-limit", `limit must be between 1 and ${MAX_LIMIT}.`, {
      grenze: MAX_LIMIT,
    });
  }

  const offset =
    query["offset"] === undefined
      ? 0
      : alsZahl(query["offset"], "ungueltiger-offset", "offset must be zero or greater.");

  const sortRoh = query["sort"];
  if (sortRoh !== undefined && !SORT_FELDER.includes(sortRoh as SortFeld)) {
    throw badRequest("unbekannte-sortierung", `sort must be one of ${SORT_FELDER.join(", ")}.`);
  }

  const dirRoh = query["dir"];
  if (dirRoh !== undefined && dirRoh !== "asc" && dirRoh !== "desc") {
    throw badRequest("unbekannte-richtung", "dir must be asc or desc.");
  }

  const qRoh = query["q"];
  const q = typeof qRoh === "string" && qRoh.trim() !== "" ? qRoh.trim() : null;

  const seit =
    query["seit"] === undefined
      ? null
      : alsZahl(
          query["seit"],
          "ungueltiger-zeitpunkt",
          "seit must be a timestamp in milliseconds.",
        );

  return {
    limit,
    offset,
    q,
    seit,
    sort: (sortRoh as SortFeld | undefined) ?? "updatedAt",
    dir: (dirRoh as "asc" | "desc" | undefined) ?? "desc",
  };
}

export function getProject(db: Db, id: string): ProjectRow {
  const row = db.select().from(projects).where(eq(projects.id, id)).get();
  if (row === undefined) throw notFound("projekt-nicht-gefunden", "Project not found.");
  return row;
}

export interface SubmodelUebersicht {
  readonly id: string;
  readonly idShort: string | null;
  /** Anzahl der Elemente im Teilmodell, ueber alle Schachtelungsebenen. */
  readonly elementCount: number;
}

/**
 * Was das Detailpanel des Einstiegs braucht, und nur das.
 *
 * Es gibt bereits `GET /api/projects/:id`, aber das liefert das ganze Environment. Fuer
 * vier Zahlen und eine kurze Liste waeren das bei einem grossen Modell einige Megabyte,
 * jedes Mal, wenn jemand eine Zeile anklickt.
 */
export function readUebersicht(db: Db, projectId: string): SubmodelUebersicht[] {
  getProject(db, projectId);
  return db
    .select({ id: submodels.id, idShort: submodels.idShort, json: submodels.json })
    .from(submodels)
    .where(eq(submodels.projectId, projectId))
    .orderBy(asc(submodels.sortIndex), asc(submodels.rowId))
    .all()
    .map((row) => ({
      id: row.id,
      idShort: row.idShort,
      elementCount: zaehleElemente(JSON.parse(row.json)),
    }));
}

/**
 * Zahl der Befunde eines Projekts: Constraint-Verstoesse aus der SDK und die zwei
 * Datenwarnungen des Editors, also genau das, was das Befund-Panel im Editor zeigt.
 *
 * Gerechnet wird hier und nicht im Klienten, damit die Zahl auch fuer Projekte stimmt, die
 * seit dem Import nie gespeichert wurden. Das Ergebnis wird mit der Fassung abgelegt, fuer
 * die es gilt: solange niemand speichert, kostet jeder weitere Abruf nichts.
 */
export async function befundeVon(db: Db, projectId: string): Promise<number> {
  const projekt = getProject(db, projectId);
  if (projekt.issueRevision === projekt.revision && projekt.issueCount !== null) {
    return projekt.issueCount;
  }

  // `normalize` ist reine JSON-Arbeit ohne SDK; erst `validate` laedt die verification.
  const model = normalize(readEnvironment(db, projectId) as Parameters<typeof normalize>[0]);
  const issues = await validate(model, anhangspfade(db, projectId));
  const anzahl = issues.length;

  db.update(projects)
    .set({ issueCount: anzahl, issueRevision: projekt.revision })
    .where(eq(projects.id, projectId))
    .run();
  return anzahl;
}

/**
 * Die Paketpfade der Anhaenge, als blosse Menge. Die Bytes liegen auf der Platte und
 * werden nicht gebraucht: die Pruefung fragt nur, ob es den Pfad gibt. Ohne diese Menge
 * meldete jedes File-Element einen fehlenden Anhang.
 */
function anhangspfade(db: Db, projectId: string): Set<string> {
  const rows = db
    .select({ path: files.path })
    .from(files)
    .where(eq(files.projectId, projectId))
    .all();
  return new Set(rows.map((row) => (row.path.startsWith("/") ? row.path : `/${row.path}`)));
}

/**
 * Zaehlt `submodelElements` rekursiv. Die Namen der Kindlisten sind die des Metamodells:
 * eine Collection und eine List fuehren `value`, eine Entity `statements`, eine Operation
 * ihre drei Variablenlisten.
 */
const KINDLISTEN = ["submodelElements", "value", "statements"] as const;

function zaehleElemente(knoten: unknown): number {
  if (Array.isArray(knoten)) {
    return knoten.reduce<number>((summe, kind) => summe + 1 + zaehleElemente(kind), 0);
  }
  if (knoten === null || typeof knoten !== "object") return 0;
  const objekt = knoten as Record<string, unknown>;
  let summe = 0;
  for (const name of KINDLISTEN) {
    // `value` ist nur bei Collection und List eine Liste; bei einer Property ist es ein
    // Text, und der zaehlt nicht mit. Die Pruefung auf Array erledigt beides.
    if (Array.isArray(objekt[name])) summe += zaehleElemente(objekt[name]);
  }
  return summe;
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

  mitNamensschutz(input.name, () =>
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
    }),
  );

  return { project: summaryOf(db, id), environment: readEnvironment(db, id) };
}

/**
 * Uebersetzt den Verstoss gegen `uq_projects_name` in eine Aussage, mit der die Oberflaeche
 * etwas anfangen kann. Der Dialog prueft vorab, aber zwischen Pruefung und Absenden kann ein
 * zweiter Tab denselben Namen belegen: massgeblich ist die Datenbank.
 */
function mitNamensschutz<T>(name: string | undefined, lauf: () => T): T {
  try {
    return lauf();
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "";
    if (text.includes("uq_projects_name") || text.includes("projects.name")) {
      throw conflict("projektname-vergeben", `The project name "${name ?? ""}" is already taken.`, {
        name: name ?? "",
      });
    }
    throw fehler;
  }
}

/**
 * Speichert einen neuen Stand. **Ueberschreibt immer.**
 *
 * Bis zum 06.08.2026 stand hier ein optimistisches Sperren: das UPDATE griff nur, wenn die
 * erwartete Revision noch die aktuelle war, sonst gab es 409 und einen Dialog mit drei
 * Wegen. Das ist auf Wunsch entfallen. Der Zaehler bleibt, weil die gemerkte Befundzahl
 * (`issue_revision`) darueber ungueltig wird.
 */
export function saveProject(db: Db, id: string, input: SaveInput): ProjectSummary {
  const now = Date.now();
  const split = splitEnvironment(input.environment);
  assertUniqueIds(split);
  const referenced = collectFilePaths(input.environment as Json);

  mitNamensschutz(input.name, () =>
    db.transaction((tx) => {
      const current = tx.select().from(projects).where(eq(projects.id, id)).get();
      if (current === undefined) throw notFound("projekt-nicht-gefunden", "Project not found.");

      tx.update(projects)
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
        .where(eq(projects.id, id))
        .run();

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
    }),
  );

  return summaryOf(db, id);
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
