import { isJsonArray, isJsonObject, type JsonObject, type JsonValue } from "./model/json.js";
import { walk, type EditorModel, type EditorNode } from "./model/store.js";

/**
 * semanticId aufloesen und daraus Wertelisten gewinnen (Plan Abschnitt 11, Phase 5).
 *
 * Der Pfad lautet:
 *   semanticId -> ConceptDescription in derselben Umgebung
 *              -> embeddedDataSpecifications
 *              -> DataSpecificationIec61360
 *              -> preferredName, unit, definition, valueList
 *              -> ValueReferencePair.valueId
 *
 * **Jedes Glied ist optional.** Fehlt eines, ist das kein Fehler, sondern schlicht kein
 * Zusatzwissen: das Wertfeld bleibt Freitext, mit Hinweis statt Meldung. Genau das
 * verlangt der Plan, und es ist der Regelfall, solange keine Katalogdatei geladen ist.
 */

/** Der erste Key-Wert einer Reference. Darueber wird die ConceptDescription gefunden. */
export function referenceTarget(reference: JsonValue | undefined): string | null {
  if (!isJsonObject(reference)) return null;
  const keys = reference["keys"];
  if (!isJsonArray(keys) || keys.length === 0) return null;

  // Fuer eine ExternalReference auf eine ConceptDescription ist der erste Key der Traeger.
  const first = keys[0];
  if (!isJsonObject(first)) return null;
  const value = first["value"];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Sucht die ConceptDescription, auf die eine semanticId zeigt.
 * Verglichen wird ueber die fachliche `id`, so wie ein Katalog es auch taete.
 */
export function resolveSemanticId(
  model: EditorModel,
  reference: JsonValue | undefined,
): EditorNode | null {
  const target = referenceTarget(reference);
  if (!target) return null;

  for (const node of walk(model)) {
    if (node.kind !== "ConceptDescription") continue;
    if (node.data["id"] === target) return node;
  }
  return null;
}

/** Die DataSpecificationIec61360 einer ConceptDescription, sofern sie eine traegt. */
export function iec61360Of(conceptDescription: EditorNode | null): JsonObject | null {
  if (!conceptDescription) return null;
  const embedded = conceptDescription.data["embeddedDataSpecifications"];
  if (!isJsonArray(embedded)) return null;

  for (const entry of embedded) {
    if (!isJsonObject(entry)) continue;
    const content = entry["dataSpecificationContent"];
    if (isJsonObject(content) && content["modelType"] === "DataSpecificationIec61360") {
      return content;
    }
  }
  return null;
}

export interface ValueChoice {
  readonly value: string;
  /** Die zugehoerige valueId, verlangt von Constraint AASd-007 */
  readonly valueId: JsonValue | null;
}

/** Die Wertepaare aus `valueList.valueReferencePairs`, leer wenn es keine gibt. */
export function valueChoices(spec: JsonObject | null): ValueChoice[] {
  if (!spec) return [];
  const list = spec["valueList"];
  if (!isJsonObject(list)) return [];

  const pairs = list["valueReferencePairs"];
  if (!isJsonArray(pairs)) return [];

  const out: ValueChoice[] = [];
  for (const pair of pairs) {
    if (!isJsonObject(pair)) continue;
    const value = pair["value"];
    if (typeof value !== "string") continue;
    out.push({ value, valueId: pair["valueId"] ?? null });
  }
  return out;
}

export interface SemanticInfo {
  readonly conceptDescription: EditorNode;
  readonly spec: JsonObject | null;
  /** Klarname, bevorzugt Deutsch, sonst Englisch, sonst der erste vorhandene */
  readonly preferredName: string | null;
  readonly definition: string | null;
  readonly unit: string | null;
  readonly dataType: string | null;
  readonly choices: readonly ValueChoice[];
}

/**
 * Alles, was der Editor ueber eine semanticId in Erfahrung bringen kann. `null`, wenn die
 * ConceptDescription nicht in derselben Umgebung liegt.
 */
export function describeSemanticId(
  model: EditorModel,
  reference: JsonValue | undefined,
  sprachen: readonly string[] = ["de", "en"],
): SemanticInfo | null {
  const conceptDescription = resolveSemanticId(model, reference);
  if (!conceptDescription) return null;

  const spec = iec61360Of(conceptDescription);
  const dataType = spec?.["dataType"];
  const unit = spec?.["unit"];

  return {
    conceptDescription,
    spec,
    preferredName: pickLangString(spec?.["preferredName"], sprachen),
    definition: pickLangString(spec?.["definition"], sprachen),
    unit: typeof unit === "string" && unit.length > 0 ? unit : null,
    dataType: typeof dataType === "string" ? dataType : null,
    choices: valueChoices(spec),
  };
}

/**
 * Einen Sprachtext auswaehlen: erst die Wunschsprachen der Reihe nach, dann irgendeinen.
 * Der Vergleich beachtet nur den Sprachteil, damit "de-DE" auf "de" passt.
 */
export function pickLangString(
  value: JsonValue | undefined,
  sprachen: readonly string[],
): string | null {
  if (!isJsonArray(value) || value.length === 0) return null;

  const eintraege = value.filter(isJsonObject);
  for (const wunsch of sprachen) {
    const treffer = eintraege.find((entry) => {
      const sprache = entry["language"];
      return typeof sprache === "string" && sprache.toLowerCase().split("-")[0] === wunsch;
    });
    const text = treffer?.["text"];
    if (typeof text === "string" && text.length > 0) return text;
  }

  const erster = eintraege[0]?.["text"];
  return typeof erster === "string" && erster.length > 0 ? erster : null;
}
