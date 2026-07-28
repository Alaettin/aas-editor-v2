/**
 * Welche Eigenschaften einer AAS-Klasse tragen Kindknoten des Baums, und welche sind
 * blosse Daten des Knotens.
 *
 * Alles, was hier nicht als Slot steht, bleibt Bestandteil des Knotens selbst und wird
 * im Formular bearbeitet: semanticId, qualifiers, description, displayName, administration,
 * extensions, embeddedDataSpecifications, assetInformation.
 */

export interface ChildSlot {
  /** Name der Eigenschaft in aas-core und im JSON, beides identisch */
  readonly name: string;
  /**
   * Operation kapselt ihre Elemente in OperationVariable. Der Baum zeigt das innere
   * SubmodelElement, die Huelle wird beim Zurueckwandeln wieder gesetzt.
   */
  readonly wrapper?: "OperationVariable";
}

export const CHILD_SLOTS: Readonly<Record<string, readonly ChildSlot[]>> = {
  Environment: [
    { name: "assetAdministrationShells" },
    { name: "submodels" },
    { name: "conceptDescriptions" },
  ],
  Submodel: [{ name: "submodelElements" }],
  SubmodelElementCollection: [{ name: "value" }],
  SubmodelElementList: [{ name: "value" }],
  Entity: [{ name: "statements" }],
  AnnotatedRelationshipElement: [{ name: "annotations" }],
  Operation: [
    { name: "inputVariables", wrapper: "OperationVariable" },
    { name: "outputVariables", wrapper: "OperationVariable" },
    { name: "inoutputVariables", wrapper: "OperationVariable" },
  ],
};

export function childSlotsOf(kind: string): readonly ChildSlot[] {
  return CHILD_SLOTS[kind] ?? [];
}

/** Die 14 SubmodelElement-Typen aus Plan Abschnitt 5. */
export const SUBMODEL_ELEMENT_KINDS = [
  "AnnotatedRelationshipElement",
  "BasicEventElement",
  "Blob",
  "Capability",
  "Entity",
  "File",
  "MultiLanguageProperty",
  "Operation",
  "Property",
  "Range",
  "ReferenceElement",
  "RelationshipElement",
  "SubmodelElementCollection",
  "SubmodelElementList",
] as const;

export type SubmodelElementKind = (typeof SUBMODEL_ELEMENT_KINDS)[number];

/** Identifiables tragen eine `id` und werden ausschliesslich darueber eindeutig gehalten. */
export const IDENTIFIABLE_KINDS = [
  "AssetAdministrationShell",
  "Submodel",
  "ConceptDescription",
] as const;

export type IdentifiableKind = (typeof IDENTIFIABLE_KINDS)[number];

export function isIdentifiableKind(kind: string): kind is IdentifiableKind {
  return (IDENTIFIABLE_KINDS as readonly string[]).includes(kind);
}

export function isSubmodelElementKind(kind: string): kind is SubmodelElementKind {
  return (SUBMODEL_ELEMENT_KINDS as readonly string[]).includes(kind);
}
