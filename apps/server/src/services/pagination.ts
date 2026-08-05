import { decodeIdentifier, encodeIdentifier } from "@aas-editor/core";
import { badRequest } from "../errors.js";

/**
 * Seitenweises Lesen ueber `limit` und einen undurchsichtigen `cursor`, so wie IDTA-01002
 * es vorgibt (Plan Abschnitt 9). Keyset statt Offset: der Cursor traegt den Sortierschluessel
 * der zuletzt gelieferten Zeile, damit das Blaettern auch dann nichts ueberspringt oder
 * doppelt liefert, wenn nebenher geschrieben wird.
 *
 * Kodiert wird mit encodeIdentifier aus dem Kern. Das ist dieselbe base64url-Funktion, die
 * IDTA-01002 fuer Identifikatoren verlangt, sie ist getestet, und es gibt keinen Grund fuer
 * eine zweite Kodierung im Projekt.
 */

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

export interface Cursor {
  /** Sortierschluessel der zuletzt gelieferten Zeile */
  readonly k: string | number;
  /** Zweitschluessel, die Zeilenkennung, macht die Sortierung eindeutig */
  readonly i: string;
}

export interface PageQuery {
  readonly limit: number;
  readonly cursor: Cursor | null;
}

export interface Page<T> {
  readonly items: T[];
  readonly nextCursor: string | null;
}

export function encodeCursor(cursor: Cursor): string {
  return encodeIdentifier(JSON.stringify({ v: 1, ...cursor }));
}

export function decodeCursor(raw: string): Cursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeIdentifier(raw));
  } catch {
    throw badRequest("ungueltiger-cursor", "Der Cursor ist nicht lesbar.");
  }

  const candidate = parsed as { v?: unknown; k?: unknown; i?: unknown };
  const keyOk = typeof candidate.k === "string" || typeof candidate.k === "number";
  if (candidate.v !== 1 || !keyOk || typeof candidate.i !== "string") {
    throw badRequest("ungueltiger-cursor", "Der Cursor ist nicht lesbar.");
  }
  return { k: candidate.k as string | number, i: candidate.i };
}

export function parsePageQuery(query: { limit?: unknown; cursor?: unknown }): PageQuery {
  let limit = DEFAULT_LIMIT;
  if (query.limit !== undefined) {
    const value = Number(query.limit);
    if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
      throw badRequest("ungueltiges-limit", `limit muss zwischen 1 und ${MAX_LIMIT} liegen.`);
    }
    limit = value;
  }

  const cursor = typeof query.cursor === "string" && query.cursor !== "" ? query.cursor : null;
  return { limit, cursor: cursor === null ? null : decodeCursor(cursor) };
}

/**
 * Nimmt limit + 1 Zeilen entgegen. Der Ueberhang entscheidet, ob es weitergeht, und wird
 * nicht ausgeliefert.
 */
export function toPage<T>(rows: T[], limit: number, key: (row: T) => Cursor): Page<T> {
  if (rows.length <= limit) return { items: rows, nextCursor: null };
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextCursor: last === undefined ? null : encodeCursor(key(last)) };
}
