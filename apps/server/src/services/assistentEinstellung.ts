import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { einstellungen } from "../db/schema.js";
import type { ServerEnv } from "../env.js";
import { badRequest } from "../errors.js";
import { entschluesseln, verschluesseln } from "./geheimnis.js";

/**
 * Der API-Schluessel des Assistenten und das gewaehlte Modell, **je Besitzer**.
 *
 * Eine Stelle, an der beides gelesen und geschrieben wird, damit der Weg des Schluessels
 * ueberschaubar bleibt: hinein ueber `setzen`, hinaus ausschliesslich ueber `leseSchluessel`,
 * und das ruft nur der Vermittler. Was die Oberflaeche sieht, liefert `lesen`, und das
 * enthaelt den Schluessel nicht.
 *
 * Jede Funktion nimmt den `besitzer` (die Sitzungskennung) und ruehrt nur dessen Zeilen an.
 * Vorher lag alles in einer globalen Zeile; siehe `db/schema.ts` und den Sicherheitsaudit.
 */

const SCHLUESSEL_ZEILE = "assistent.schluessel";
const MODELL_ZEILE = "assistent.modell";

/** Die drei Modelle der aktuellen Reihe, Preise je Million Token Eingabe / Ausgabe. */
export const MODELLE = [
  { id: "gpt-5.6-sol", eingabe: 5, ausgabe: 30 },
  { id: "gpt-5.6-terra", eingabe: 2, ausgabe: 12 },
  { id: "gpt-5.6-luna", eingabe: 0.2, ausgabe: 1.2 },
] as const;

export const STANDARD_MODELL = MODELLE[0].id;

export interface AssistentEinstellung {
  /** Ob ein lesbarer Schluessel hinterlegt ist. */
  readonly gesetzt: boolean;
  /** Die letzten vier Zeichen, damit der Nutzer erkennt, welcher Schluessel liegt. */
  readonly endung: string | null;
  readonly modell: string;
  /**
   * Die Auswahl gehoert in **jede** Antwort, nicht nur in die des GET. Sonst kommt sie
   * beim Speichern abhanden, die Maske rendert eine Liste, die es nicht gibt, und der
   * Nutzer sieht die Fehlerseite statt seines gespeicherten Schluessels.
   */
  readonly modelle: typeof MODELLE;
}

function zeilen(db: Db, besitzer: string): Map<string, string> {
  const rows = db
    .select()
    .from(einstellungen)
    .where(
      and(
        eq(einstellungen.ownerId, besitzer),
        inArray(einstellungen.schluessel, [SCHLUESSEL_ZEILE, MODELL_ZEILE]),
      ),
    )
    .all();
  return new Map(rows.map((row) => [row.schluessel, row.wert]));
}

function schreibe(db: Db, besitzer: string, schluessel: string, wert: string): void {
  db.insert(einstellungen)
    .values({ ownerId: besitzer, schluessel, wert, aktualisiert: Date.now() })
    .onConflictDoUpdate({
      target: [einstellungen.ownerId, einstellungen.schluessel],
      set: { wert, aktualisiert: Date.now() },
    })
    .run();
}

export function lesen(db: Db, env: ServerEnv, besitzer: string): AssistentEinstellung {
  const gespeichert = zeilen(db, besitzer);
  const roh = gespeichert.get(SCHLUESSEL_ZEILE);
  const klar = roh === undefined ? null : entschluesseln(roh, env.sessionSecret);

  return {
    gesetzt: klar !== null,
    endung: klar === null ? null : klar.slice(-4),
    modell: gespeichert.get(MODELL_ZEILE) ?? STANDARD_MODELL,
    modelle: MODELLE,
  };
}

/** Nur fuer den Vermittler. Der Klartext geht von hier direkt an OpenAI und nirgends sonst. */
export function leseSchluessel(db: Db, env: ServerEnv, besitzer: string): string | null {
  const roh = zeilen(db, besitzer).get(SCHLUESSEL_ZEILE);
  return roh === undefined ? null : entschluesseln(roh, env.sessionSecret);
}

export function setzen(
  db: Db,
  env: ServerEnv,
  besitzer: string,
  eingabe: { schluessel?: unknown; modell?: unknown },
): AssistentEinstellung {
  if (eingabe.schluessel !== undefined) {
    if (typeof eingabe.schluessel !== "string" || eingabe.schluessel.trim() === "") {
      throw badRequest("assistent-schluessel-ungueltig", "The API key must be a non-empty string.");
    }
    schreibe(
      db,
      besitzer,
      SCHLUESSEL_ZEILE,
      verschluesseln(eingabe.schluessel.trim(), env.sessionSecret),
    );
  }

  if (eingabe.modell !== undefined) {
    const erlaubt = MODELLE.some((modell) => modell.id === eingabe.modell);
    if (!erlaubt) {
      throw badRequest("assistent-modell-unbekannt", "Unknown model.", {
        erlaubt: MODELLE.map((modell) => modell.id),
      });
    }
    schreibe(db, besitzer, MODELL_ZEILE, eingabe.modell as string);
  }

  return lesen(db, env, besitzer);
}

/** Loescht den Schluessel des Besitzers. Das Modell bleibt stehen, es ist kein Geheimnis. */
export function loeschen(db: Db, env: ServerEnv, besitzer: string): AssistentEinstellung {
  db.delete(einstellungen)
    .where(
      and(eq(einstellungen.ownerId, besitzer), eq(einstellungen.schluessel, SCHLUESSEL_ZEILE)),
    )
    .run();
  return lesen(db, env, besitzer);
}
