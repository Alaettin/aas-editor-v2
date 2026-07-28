import { openDB, type IDBPDatabase } from "idb";
import type { EditorModel } from "@aas-editor/core";

/**
 * Lokale Zwischenspeicherung in IndexedDB (Plan Abschnitt 11, Phase 5).
 *
 * Nach einem Absturz oder versehentlichem Schliessen wird der letzte Stand angeboten.
 *
 * **Anhangs-Bytes wandern bewusst nicht mit.** Sie liegen im Worker, koennen zweistellig
 * viele Megabyte gross sein, und eine Zwischenspeicherung, die bei der ersten grossen
 * AASX-Datei am Speicherkontingent scheitert, waere schlimmer als keine. Gespeichert
 * werden nur ihre Metadaten, und der Wiederherstellungsdialog sagt das.
 */

const DB_NAME = "aas-editor";
const DB_VERSION = 1;
const STORE = "entwurf";
const KEY = "aktuell";

export interface Draft {
  readonly model: EditorModel;
  readonly fileName: string;
  readonly format: string;
  /** Nur Metadaten, keine Bytes */
  readonly attachmentPaths: readonly string[];
  readonly savedAt: number;
  readonly nodeCount: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
    },
  });
  return dbPromise;
}

export async function saveDraft(draft: Draft): Promise<void> {
  try {
    (await db()).put(STORE, draft, KEY);
  } catch {
    // Ein voller oder gesperrter Speicher darf das Bearbeiten nicht anhalten.
  }
}

export async function loadDraft(): Promise<Draft | null> {
  try {
    const draft = (await (await db()).get(STORE, KEY)) as Draft | undefined;
    return draft ?? null;
  } catch {
    return null;
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await (await db()).delete(STORE, KEY);
  } catch {
    // siehe oben
  }
}

/**
 * Entprelltes Speichern. Richtwert 2 s nach der letzten Aenderung: haeufig genug, dass
 * kaum Arbeit verlorengeht, selten genug, dass IndexedDB nicht bei jedem Tastendruck
 * schreibt.
 */
export function createAutosave(delay = 2000): (draft: Draft) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (draft: Draft) => {
    clearTimeout(timer);
    timer = setTimeout(() => void saveDraft(draft), delay);
  };
}
