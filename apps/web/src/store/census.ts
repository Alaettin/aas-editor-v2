import { isIdentifiableKind, type EditorModel } from "@aas-editor/core";

/**
 * Typzensus der geladenen Umgebung: Shells, Submodels, Submodel-Elemente und
 * ConceptDescriptions.
 *
 * Steht im Kopf des Explorers und beantwortet die erste Frage, die man an eine fremde
 * Datei hat, ohne dass man scrollen muss.
 */

export interface Census {
  readonly AssetAdministrationShell: number;
  readonly Submodel: number;
  readonly ConceptDescription: number;
  /** Alles unterhalb der Identifiables, also die eigentliche Nutzlast. */
  readonly SubmodelElement: number;
}

export const LEERER_ZENSUS: Census = {
  AssetAdministrationShell: 0,
  Submodel: 0,
  ConceptDescription: 0,
  SubmodelElement: 0,
};

export function buildCensus(model: EditorModel | null): Census {
  if (!model) return LEERER_ZENSUS;

  // Direkt ueber die flache Knotenmap statt ueber den `walk`-Generator: der Zensus fragt
  // nicht nach der Baumordnung, und ein Generator je Knoten kostet bei zehntausend
  // Elementen ein Vielfaches der reinen Zaehlung.
  const zaehler = { ...LEERER_ZENSUS } as Record<keyof Census, number>;
  for (const node of Object.values(model.nodes)) {
    // Die Wurzel ist kein Element: sie zaehlt in keiner der vier Spalten mit.
    if (isIdentifiableKind(node.kind)) zaehler[node.kind] += 1;
    else if (node.parent !== null) zaehler.SubmodelElement += 1;
  }
  return zaehler;
}
