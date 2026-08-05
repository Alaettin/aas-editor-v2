import { openDB, type IDBPDatabase } from "idb";
import type { EditorModel } from "@aas-editor/core";

import { meldeHinweis } from "@/lib/melden";

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
  /**
   * Zu welchem Serverprojekt der Entwurf gehoert, falls es eines gibt. Ohne das wuerde
   * ein Entwurf aus Projekt A beim Oeffnen von Projekt B angeboten.
   */
  readonly projektId?: string | null;
  readonly revision?: number;
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

/**
 * Ob der Fehlschlag schon gemeldet wurde. Bei einem vollen Speicher scheitert jeder
 * weitere Versuch ebenfalls; alle zwei Sekunden dieselbe Meldung waere unbrauchbar.
 */
let fehlschlagGemeldet = false;

export async function saveDraft(draft: Draft): Promise<void> {
  try {
    await (await db()).put(STORE, draft, KEY);
    fehlschlagGemeldet = false;
  } catch {
    // Ein voller oder gesperrter Speicher darf das Bearbeiten nicht anhalten. Still
    // bleiben darf er aber auch nicht: der Nutzer haelt seine Arbeit sonst fuer
    // gesichert, obwohl sie es nicht ist.
    if (!fehlschlagGemeldet) {
      fehlschlagGemeldet = true;
      meldeHinweis("melden.entwurfNichtGesichert");
    }
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
 *
 * Uebergeben wird eine Funktion, nicht der fertige Entwurf: sein Aufbau kostet einen Lauf
 * ueber alle Knoten, und der gehoert hinter die Entprellung, nicht in den Tastendruck.
 */
export function createAutosave(delay = 2000): (entwurf: () => Draft) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (entwurf: () => Draft) => {
    clearTimeout(timer);
    timer = setTimeout(() => void saveDraft(entwurf()), delay);
  };
}
