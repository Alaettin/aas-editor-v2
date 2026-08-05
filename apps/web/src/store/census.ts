import { isIdentifiableKind, walk, type EditorModel } from "@aas-editor/core";

/**
 * Typzensus der geladenen Umgebung: wie viele Shells, Submodels und ConceptDescriptions.
 *
 * Steht in der Fusszeile des Explorers und beantwortet die erste Frage, die man an eine
 * fremde Datei hat, ohne dass man scrollen muss.
 */

export interface Census {
  readonly AssetAdministrationShell: number;
  readonly Submodel: number;
  readonly ConceptDescription: number;
}

export const LEERER_ZENSUS: Census = {
  AssetAdministrationShell: 0,
  Submodel: 0,
  ConceptDescription: 0,
};

export function buildCensus(model: EditorModel | null): Census {
  if (!model) return LEERER_ZENSUS;

  const zaehler = { ...LEERER_ZENSUS } as Record<keyof Census, number>;
  for (const node of walk(model)) {
    if (isIdentifiableKind(node.kind)) zaehler[node.kind] += 1;
  }
  return zaehler;
}
