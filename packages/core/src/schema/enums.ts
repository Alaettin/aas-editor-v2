/**
 * Die Aufzaehlungswerte des Metamodells als schlichte Zeichenketten.
 *
 * Warum nicht direkt aus der SDK: `types` ist 324 KB und gehoert in den Worker. Das
 * Formular im Hauptthread braucht aber die Auswahllisten. Die Werte stehen deshalb hier,
 * und `test/enums.test.ts` haelt sie gegen die SDK: er ruft `stringification.*ToString`
 * fuer jeden Enum-Wert auf und vergleicht Reihenfolge und Inhalt. Weicht das Metamodell
 * ab, faellt der Test, nicht die Oberflaeche.
 *
 * Erzeugt aus @aas-core-works/aas-core3.1-typescript 1.0.1 am 28.07.2026.
 */

export const ASSET_KIND = ["Type", "Instance", "Role", "NotApplicable"] as const;

export const MODELLING_KIND = ["Template", "Instance"] as const;

export const QUALIFIER_KIND = [
  "ValueQualifier",
  "ConceptQualifier",
  "TemplateQualifier",
] as const;

export const ENTITY_TYPE = ["CoManagedEntity", "SelfManagedEntity"] as const;

export const DIRECTION = ["input", "output"] as const;

export const STATE_OF_EVENT = ["on", "off"] as const;

export const AAS_SUBMODEL_ELEMENTS = [
  "AnnotatedRelationshipElement",
  "BasicEventElement",
  "Blob",
  "Capability",
  "DataElement",
  "Entity",
  "EventElement",
  "File",
  "MultiLanguageProperty",
  "Operation",
  "Property",
  "Range",
  "ReferenceElement",
  "RelationshipElement",
  "SubmodelElement",
  "SubmodelElementList",
  "SubmodelElementCollection",
] as const;

export const REFERENCE_TYPES = ["ExternalReference", "ModelReference"] as const;

export const KEY_TYPES = [
  "AnnotatedRelationshipElement",
  "AssetAdministrationShell",
  "BasicEventElement",
  "Blob",
  "Capability",
  "ConceptDescription",
  "DataElement",
  "Entity",
  "EventElement",
  "File",
  "FragmentReference",
  "GlobalReference",
  "Identifiable",
  "MultiLanguageProperty",
  "Operation",
  "Property",
  "Range",
  "Referable",
  "ReferenceElement",
  "RelationshipElement",
  "Submodel",
  "SubmodelElement",
  "SubmodelElementCollection",
  "SubmodelElementList",
] as const;

export const DATA_TYPE_DEF_XSD = [
  "xs:anyURI",
  "xs:base64Binary",
  "xs:boolean",
  "xs:byte",
  "xs:date",
  "xs:dateTime",
  "xs:decimal",
  "xs:double",
  "xs:duration",
  "xs:float",
  "xs:gDay",
  "xs:gMonth",
  "xs:gMonthDay",
  "xs:gYear",
  "xs:gYearMonth",
  "xs:hexBinary",
  "xs:int",
  "xs:integer",
  "xs:long",
  "xs:negativeInteger",
  "xs:nonNegativeInteger",
  "xs:nonPositiveInteger",
  "xs:positiveInteger",
  "xs:short",
  "xs:string",
  "xs:time",
  "xs:unsignedByte",
  "xs:unsignedInt",
  "xs:unsignedLong",
  "xs:unsignedShort",
] as const;

export const DATA_TYPE_IEC61360 = [
  "DATE",
  "STRING",
  "STRING_TRANSLATABLE",
  "INTEGER_MEASURE",
  "INTEGER_COUNT",
  "INTEGER_CURRENCY",
  "REAL_MEASURE",
  "REAL_COUNT",
  "REAL_CURRENCY",
  "BOOLEAN",
  "IRI",
  "IRDI",
  "RATIONAL",
  "RATIONAL_MEASURE",
  "TIME",
  "TIMESTAMP",
  "FILE",
  "HTML",
  "BLOB",
] as const;

/** Alle Aufzaehlungen unter einem Namen, damit die Feldbeschreibung sie referenzieren kann. */
export const ENUMS = {
  AssetKind: ASSET_KIND,
  ModellingKind: MODELLING_KIND,
  QualifierKind: QUALIFIER_KIND,
  EntityType: ENTITY_TYPE,
  Direction: DIRECTION,
  StateOfEvent: STATE_OF_EVENT,
  AasSubmodelElements: AAS_SUBMODEL_ELEMENTS,
  ReferenceTypes: REFERENCE_TYPES,
  KeyTypes: KEY_TYPES,
  DataTypeDefXsd: DATA_TYPE_DEF_XSD,
  DataTypeIec61360: DATA_TYPE_IEC61360,
} as const satisfies Record<string, readonly string[]>;

export type EnumName = keyof typeof ENUMS;

/**
 * Die xsd-Typen, die im Formular ein anderes Eingabefeld verdienen als reinen Text.
 * Rein zur Bedienbarkeit, das Modell speichert immer eine Zeichenkette.
 */
export const XSD_INPUT_HINT: Readonly<Record<string, "number" | "date" | "datetime" | "boolean">> =
  {
    "xs:boolean": "boolean",
    "xs:date": "date",
    "xs:dateTime": "datetime",
    "xs:byte": "number",
    "xs:decimal": "number",
    "xs:double": "number",
    "xs:float": "number",
    "xs:int": "number",
    "xs:integer": "number",
    "xs:long": "number",
    "xs:negativeInteger": "number",
    "xs:nonNegativeInteger": "number",
    "xs:nonPositiveInteger": "number",
    "xs:positiveInteger": "number",
    "xs:short": "number",
    "xs:unsignedByte": "number",
    "xs:unsignedInt": "number",
    "xs:unsignedLong": "number",
    "xs:unsignedShort": "number",
  };
