import { randomUUID } from "node:crypto";
import { badRequest } from "../errors.js";

/**
 * Zerlegt ein Environment in einzeln adressierbare Identifiable-Zeilen und setzt es wieder
 * zusammen (Plan Abschnitt 9).
 *
 * Der Server sieht nie ein EditorModel, nur gewoehnliches AAS-JSON. normalize und
 * denormalize bleiben Sache des Klienten. Damit steht der Server auch fuer die spaetere
 * IDTA-Schnittstelle richtig, die ebenfalls AAS-JSON spricht und kein Editor-Format.
 */

export type Json = Record<string, unknown>;

export const IDENTIFIABLE_SLOTS = [
  "assetAdministrationShells",
  "submodels",
  "conceptDescriptions",
] as const;

export type IdentifiableSlot = (typeof IDENTIFIABLE_SLOTS)[number];

export interface SplitRow {
  readonly rowId: string;
  readonly id: string;
  readonly idShort: string | null;
  readonly sortIndex: number;
  readonly json: string;
}

export type SplitEnvironment = {
  /** Die Wurzelfelder ohne die drei Slots, als JSON-Text */
  readonly environmentData: string;
  readonly rows: Readonly<Record<IdentifiableSlot, SplitRow[]>>;
};

function asList(value: unknown, slot: string): Json[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw badRequest("slot-keine-liste", `${slot} must be a list.`, { slot });
  }
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw badRequest("slot-eintrag-kein-objekt", `${slot} contains a non-object entry.`, {
        slot,
      });
    }
  }
  return value as Json[];
}

export function splitEnvironment(environment: unknown): SplitEnvironment {
  if (typeof environment !== "object" || environment === null || Array.isArray(environment)) {
    throw badRequest("environment-kein-objekt", "The environment must be an object.");
  }

  const source = environment as Json;
  const rest: Json = {};
  for (const [key, value] of Object.entries(source)) {
    // Alles ausser den drei Slots bleibt als Wurzelfeld erhalten. Ohne diesen Schritt
    // waere der Rundlauf verlustbehaftet, sobald das Metamodell der Wurzel ein Feld gibt.
    if (!(IDENTIFIABLE_SLOTS as readonly string[]).includes(key)) rest[key] = value;
  }

  const rows = {} as Record<IdentifiableSlot, SplitRow[]>;
  for (const slot of IDENTIFIABLE_SLOTS) {
    rows[slot] = asList(source[slot], slot).map((entry, index) => ({
      rowId: randomUUID(),
      id: typeof entry["id"] === "string" ? entry["id"] : "",
      idShort: typeof entry["idShort"] === "string" ? entry["idShort"] : null,
      sortIndex: index,
      json: JSON.stringify(entry),
    }));
  }

  return { environmentData: JSON.stringify(rest), rows };
}

/**
 * Setzt wieder zusammen.
 *
 * **Ein leerer Slot wird weggelassen, nicht als leere Liste geschrieben.** Das Metamodell
 * verlangt fuer alle drei "either not set or have at least one item"; ein
 * `"assetAdministrationShells": []` ist also selbst ein Constraint-Verstoss. Solange die
 * leeren Listen mitgeschrieben wurden, trug jedes Projekt ohne Verwaltungsschale zwei
 * erfundene Befunde mit sich herum, im Editor wie in der Befundzahl des Einstiegs.
 */
export function joinEnvironment(
  environmentData: string,
  rows: Readonly<Record<IdentifiableSlot, { json: string }[]>>,
): Json {
  const root = JSON.parse(environmentData) as Json;
  const out: Json = { ...root };
  for (const slot of IDENTIFIABLE_SLOTS) {
    if (rows[slot].length === 0) {
      delete out[slot];
      continue;
    }
    out[slot] = rows[slot].map((row) => JSON.parse(row.json) as Json);
  }
  return out;
}

/** Alle Paketpfade, auf die ein File-Element im Environment zeigt. */
export function collectFilePaths(environment: Json): Set<string> {
  const paths = new Set<string>();

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (typeof value !== "object" || value === null) return;

    const node = value as Json;
    if (node["modelType"] === "File" && typeof node["value"] === "string" && node["value"] !== "") {
      paths.add(node["value"]);
    }
    for (const entry of Object.values(node)) visit(entry);
  };

  visit(environment);
  return paths;
}
