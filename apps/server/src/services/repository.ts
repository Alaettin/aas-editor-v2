import { randomUUID } from "node:crypto";
import { and, asc, count, eq, gt, or } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  repositories,
  repositorySubmodels,
  submodels,
  type RepositoryRow,
} from "../db/schema.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { toPage, type Cursor, type Page, type PageQuery } from "./pagination.js";
import { getProject } from "./projects.js";

/**
 * Das Submodel Repository: die Ablage, aus der ein fremdes Werkzeug einzelne Teilmodelle
 * ueber HTTP zieht, ohne den Editor zu kennen.
 *
 * Der entscheidende Zuschnitt ist die **Momentaufnahme**. Uebernommen wird das JSON, nicht
 * ein Verweis auf die Projektzeile: wer sein Projekt weiterbearbeitet, aendert damit nicht,
 * was nach aussen ausgeliefert wird. Das ist keine Bequemlichkeit, sondern die Zusage an
 * denjenigen, der die Adresse bekommen hat. Wer das Repository nachziehen will, uebernimmt
 * dasselbe Teilmodell erneut und ueberschreibt dabei ausdruecklich.
 *
 * Uebernommen werden ausschliesslich **Teilmodelle**, nie eine ganze Schale. Es gibt keinen
 * Weg dafuer: die Uebernahme kennt genau eine `submodelId`.
 */

export interface RepositoryInfo {
  readonly id: string;
  readonly anzahl: number;
  readonly erstelltAm: number;
}

/** Was die Maske je uebernommenem Teilmodell zeigt. Ohne das JSON: es kann gross sein. */
export interface RepositoryEintrag {
  readonly id: string;
  readonly idShort: string | null;
  readonly herkunftProjektId: string;
  readonly herkunftProjektName: string;
  readonly uebernommenAm: number;
  readonly updatedAt: number;
}

function anzahlIn(db: Db, repositoryId: string): number {
  return (
    db
      .select({ anzahl: count() })
      .from(repositorySubmodels)
      .where(eq(repositorySubmodels.repositoryId, repositoryId))
      .get()?.anzahl ?? 0
  );
}

function alsInfo(db: Db, row: RepositoryRow): RepositoryInfo {
  return { id: row.id, anzahl: anzahlIn(db, row.id), erstelltAm: row.createdAt };
}

/** Das Repository des Besitzers, oder null, solange keines gestartet ist. */
export function findeRepository(db: Db, besitzer: string): RepositoryInfo | null {
  const row = db.select().from(repositories).where(eq(repositories.ownerId, besitzer)).get();
  return row === undefined ? null : alsInfo(db, row);
}

/**
 * Startet das Repository und liefert es zurueck.
 *
 * Zweimal aufgerufen ergibt dasselbe, keinen Konflikt: der Knopf "Repository starten" darf
 * aus zwei offenen Reitern gedrueckt werden, ohne dass einer davon einen Fehler sieht.
 */
export function starteRepository(db: Db, besitzer: string): RepositoryInfo {
  const vorhanden = db
    .select()
    .from(repositories)
    .where(eq(repositories.ownerId, besitzer))
    .get();
  if (vorhanden !== undefined) return alsInfo(db, vorhanden);

  const row: RepositoryRow = { id: randomUUID(), ownerId: besitzer, createdAt: Date.now() };
  db.insert(repositories).values(row).run();
  return alsInfo(db, row);
}

/**
 * Das Repository des Besitzers, oder ein Fehler.
 *
 * Der Wachposten fuer alles, was am Repository haengt, im selben Sinn wie `getProject`.
 */
export function holeRepository(db: Db, besitzer: string): RepositoryRow {
  const row = db.select().from(repositories).where(eq(repositories.ownerId, besitzer)).get();
  if (row === undefined) {
    throw notFound("repository-nicht-gestartet", "No submodel repository has been started yet.");
  }
  return row;
}

/** Die Liste fuer die Maske, nach der fachlichen id, wie sie auch oeffentlich erscheint. */
export function listeEintraege(db: Db, repositoryId: string): RepositoryEintrag[] {
  return db
    .select({
      id: repositorySubmodels.id,
      idShort: repositorySubmodels.idShort,
      herkunftProjektId: repositorySubmodels.herkunftProjektId,
      herkunftProjektName: repositorySubmodels.herkunftProjektName,
      uebernommenAm: repositorySubmodels.uebernommenAm,
      updatedAt: repositorySubmodels.updatedAt,
    })
    .from(repositorySubmodels)
    .where(eq(repositorySubmodels.repositoryId, repositoryId))
    .orderBy(asc(repositorySubmodels.id), asc(repositorySubmodels.rowId))
    .all();
}

export interface UebernahmeEingabe {
  readonly projektId: string;
  readonly submodelId: string;
  readonly ueberschreiben: boolean;
}

export interface Uebernahme {
  readonly id: string;
  readonly idShort: string | null;
  readonly ueberschrieben: boolean;
}

/**
 * Ein Teilmodell aus einem eigenen Projekt in das Repository uebernehmen.
 *
 * Der Wachposten steht vor dem Lesen, nicht danach: `getProject` bestaetigt erst, dass das
 * Projekt dem Anrufer gehoert, und dann wird ueberhaupt eine Zeile geholt.
 *
 * Steht die fachliche `id` schon im Repository und `ueberschreiben` ist nicht gesetzt, ist
 * das ein **409 mit Angaben**, kein stilles Ueberschreiben und kein stilles Ueberspringen.
 * Der Nutzer soll sehen, was schon da ist und woher es kam, und dann entscheiden.
 */
export function uebernehme(
  db: Db,
  besitzer: string,
  repositoryId: string,
  eingabe: UebernahmeEingabe,
): Uebernahme {
  const projekt = getProject(db, besitzer, eingabe.projektId);

  const quelle = db
    .select({ id: submodels.id, idShort: submodels.idShort, json: submodels.json })
    .from(submodels)
    .where(and(eq(submodels.projectId, projekt.id), eq(submodels.id, eingabe.submodelId)))
    .get();
  if (quelle === undefined) {
    throw notFound("submodel-nicht-gefunden", "Submodel not found.");
  }
  /*
   * Ein Teilmodell ohne `id` laesst sich nicht ausliefern: IDTA-01002 adressiert
   * ausschliesslich darueber. Im Editor ist das Feld waehrend der Arbeit leer erlaubt,
   * hier waere es eine Zeile ohne Adresse. Der Unique-Index faellt darauf nicht herein,
   * er wuerde nur das zweite leere ablehnen.
   */
  if (quelle.id.trim() === "") {
    throw badRequest(
      "submodel-ohne-id",
      "The submodel has no id and cannot be served by a repository.",
    );
  }

  const jetzt = Date.now();
  const vorhanden = db
    .select({
      rowId: repositorySubmodels.rowId,
      uebernommenAm: repositorySubmodels.uebernommenAm,
      idShort: repositorySubmodels.idShort,
      herkunftProjektName: repositorySubmodels.herkunftProjektName,
    })
    .from(repositorySubmodels)
    .where(
      and(
        eq(repositorySubmodels.repositoryId, repositoryId),
        eq(repositorySubmodels.id, quelle.id),
      ),
    )
    .get();

  if (vorhanden !== undefined) {
    if (!eingabe.ueberschreiben) {
      throw conflict(
        "submodel-schon-im-repo",
        "A submodel with this id is already in the repository.",
        {
          id: quelle.id,
          idShort: vorhanden.idShort,
          uebernommenAm: vorhanden.uebernommenAm,
          herkunftProjektName: vorhanden.herkunftProjektName,
        },
      );
    }

    db.update(repositorySubmodels)
      .set({
        idShort: quelle.idShort,
        json: quelle.json,
        herkunftProjektId: projekt.id,
        herkunftProjektName: projekt.name,
        // `uebernommenAm` bleibt stehen: es sagt, seit wann diese id ausgeliefert wird.
        // Wann der Inhalt zuletzt nachgezogen wurde, sagt `updatedAt`.
        updatedAt: jetzt,
      })
      .where(eq(repositorySubmodels.rowId, vorhanden.rowId))
      .run();
    return { id: quelle.id, idShort: quelle.idShort, ueberschrieben: true };
  }

  db.insert(repositorySubmodels)
    .values({
      rowId: randomUUID(),
      repositoryId,
      id: quelle.id,
      idShort: quelle.idShort,
      json: quelle.json,
      herkunftProjektId: projekt.id,
      herkunftProjektName: projekt.name,
      uebernommenAm: jetzt,
      updatedAt: jetzt,
    })
    .run();
  return { id: quelle.id, idShort: quelle.idShort, ueberschrieben: false };
}

export function entferne(db: Db, repositoryId: string, submodelId: string): void {
  const ergebnis = db
    .delete(repositorySubmodels)
    .where(
      and(
        eq(repositorySubmodels.repositoryId, repositoryId),
        eq(repositorySubmodels.id, submodelId),
      ),
    )
    .run();
  if (ergebnis.changes === 0) {
    throw notFound("submodel-nicht-im-repo", "Submodel not found in the repository.");
  }
}

// --- der oeffentliche Weg ---------------------------------------------------------------

/**
 * Ob es diese Adresse gibt. Bewusst ohne Besitzer: die UUID **ist** der Zugang.
 */
export function repositoryExistiert(db: Db, repositoryId: string): boolean {
  return (
    db.select({ id: repositories.id }).from(repositories).where(eq(repositories.id, repositoryId))
      .get() !== undefined
  );
}

/**
 * Die Teilmodelle einer Adresse, seitenweise nach der fachlichen id.
 *
 * Keyset statt Offset, ueber dieselbe Cursor-Kodierung wie der Rest des Servers: das
 * Blaettern ueberspringt und doppelt auch dann nicht, wenn nebenher uebernommen wird.
 */
export function oeffentlicheListe(
  db: Db,
  repositoryId: string,
  page: PageQuery,
  idShort: string | null,
): Page<unknown> {
  const cursorWhere =
    page.cursor === null
      ? undefined
      : or(
          gt(repositorySubmodels.id, String(page.cursor.k)),
          and(
            eq(repositorySubmodels.id, String(page.cursor.k)),
            gt(repositorySubmodels.rowId, page.cursor.i),
          ),
        );

  const rows = db
    .select({
      rowId: repositorySubmodels.rowId,
      id: repositorySubmodels.id,
      json: repositorySubmodels.json,
    })
    .from(repositorySubmodels)
    .where(
      and(
        eq(repositorySubmodels.repositoryId, repositoryId),
        idShort === null ? undefined : eq(repositorySubmodels.idShort, idShort),
        cursorWhere,
      ),
    )
    .orderBy(asc(repositorySubmodels.id), asc(repositorySubmodels.rowId))
    .limit(page.limit + 1)
    .all();

  const seite = toPage(rows, page.limit, (row): Cursor => ({ k: row.id, i: row.rowId }));
  return {
    items: seite.items.map((row) => JSON.parse(row.json) as unknown),
    nextCursor: seite.nextCursor,
  };
}

/** Ein einzelnes Teilmodell unter seiner fachlichen id, oder null. */
export function oeffentlichesSubmodel(
  db: Db,
  repositoryId: string,
  submodelId: string,
): unknown | null {
  const row = db
    .select({ json: repositorySubmodels.json })
    .from(repositorySubmodels)
    .where(
      and(
        eq(repositorySubmodels.repositoryId, repositoryId),
        eq(repositorySubmodels.id, submodelId),
      ),
    )
    .get();
  return row === undefined ? null : (JSON.parse(row.json) as unknown);
}
