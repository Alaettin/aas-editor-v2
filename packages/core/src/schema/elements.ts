import type { ElementSpec, FieldGroupSpec, FieldSpec } from "./fields.js";

/**
 * Ein Deskriptor je Elementtyp, zusammengesetzt aus wiederverwendbaren Bloecken.
 *
 * Die Bloecke bilden die Schnittstellen des Metamodells ab (Referable, HasSemantics,
 * Qualifiable, HasDataSpecification, Identifiable, HasExtensions). Dadurch steht jedes
 * gemeinsame Attribut genau einmal, und ein neues gemeinsames Feld erreicht alle Typen
 * mit einer Zeile.
 *
 * Kind-Slots (submodelElements, value bei Collection und List, statements, annotations,
 * die drei Operation-Slots) tauchen hier **nicht** auf. Sie leben im Baum, siehe
 * `CHILD_SLOTS` in model/kinds.ts.
 */

// --- Wiederverwendbare Bloecke ------------------------------------------------------

const REFERABLE: readonly FieldSpec[] = [
  { key: "idShort", kind: "text", hint: "feld.idShort" },
  { key: "displayName", kind: "langStrings" },
  { key: "description", kind: "langStrings" },
  { key: "category", kind: "text", hint: "feld.category", deprecated: true },
];

const IDENTIFIABLE: readonly FieldSpec[] = [
  { key: "id", kind: "text", required: true, hint: "feld.id" },
];

const HAS_SEMANTICS: readonly FieldSpec[] = [
  { key: "semanticId", kind: "reference", hint: "feld.semanticId" },
  { key: "supplementalSemanticIds", kind: "referenceList" },
];

function referableGroup(extra: readonly FieldSpec[] = []): FieldGroupSpec {
  return { title: "gruppe.allgemein", fields: [...extra, ...REFERABLE] };
}

const SEMANTIK_GROUP: FieldGroupSpec = { title: "gruppe.semantik", fields: HAS_SEMANTICS };

const QUALIFIER_GROUP: FieldGroupSpec = {
  title: "gruppe.qualifier",
  collapsed: true,
  fields: [{ key: "qualifiers", kind: "qualifierList" }],
};

const EXTENSION_GROUP: FieldGroupSpec = {
  title: "gruppe.erweiterungen",
  collapsed: true,
  fields: [
    { key: "extensions", kind: "extensionList" },
    { key: "embeddedDataSpecifications", kind: "dataSpecificationList" },
  ],
};

const VERWALTUNG_GROUP: FieldGroupSpec = {
  title: "gruppe.verwaltung",
  collapsed: true,
  fields: [{ key: "administration", kind: "administration" }],
};

/** Der uebliche Bauplan eines SubmodelElements: Allgemein, Typeigenes, Semantik, Rest. */
function submodelElement(kind: string, own: readonly FieldSpec[] = []): ElementSpec {
  const groups: FieldGroupSpec[] = [referableGroup()];
  if (own.length > 0) groups.push({ title: "gruppe.wert", fields: own });
  groups.push(SEMANTIK_GROUP, QUALIFIER_GROUP, EXTENSION_GROUP);
  return { kind, groups };
}

// --- Die 14 SubmodelElement-Typen ---------------------------------------------------

const SUBMODEL_ELEMENTS: ElementSpec[] = [
  submodelElement("Property", [
    { key: "valueType", kind: "enum", enum: "DataTypeDefXsd", required: true },
    { key: "value", kind: "text", typedBy: "valueType" },
    { key: "valueId", kind: "reference", hint: "feld.valueId" },
  ]),

  submodelElement("MultiLanguageProperty", [
    { key: "value", kind: "langStrings" },
    { key: "valueId", kind: "reference", hint: "feld.valueId" },
  ]),

  submodelElement("Range", [
    { key: "valueType", kind: "enum", enum: "DataTypeDefXsd", required: true },
    { key: "min", kind: "text", typedBy: "valueType" },
    { key: "max", kind: "text", typedBy: "valueType" },
  ]),

  submodelElement("Blob", [
    { key: "contentType", kind: "text", required: true, hint: "feld.contentType" },
    { key: "value", kind: "blob", hint: "feld.blobValue" },
  ]),

  submodelElement("File", [
    { key: "contentType", kind: "text", required: true, hint: "feld.contentType" },
    { key: "value", kind: "attachment", hint: "feld.fileValue" },
  ]),

  submodelElement("ReferenceElement", [{ key: "value", kind: "reference" }]),

  submodelElement("RelationshipElement", [
    { key: "first", kind: "reference", required: true },
    { key: "second", kind: "reference", required: true },
  ]),

  submodelElement("AnnotatedRelationshipElement", [
    { key: "first", kind: "reference", required: true },
    { key: "second", kind: "reference", required: true },
  ]),

  submodelElement("Capability"),

  submodelElement("Operation"),

  submodelElement("BasicEventElement", [
    { key: "observed", kind: "reference", required: true, hint: "feld.observed" },
    { key: "direction", kind: "enum", enum: "Direction", required: true },
    { key: "state", kind: "enum", enum: "StateOfEvent", required: true },
    { key: "messageTopic", kind: "text" },
    { key: "messageBroker", kind: "reference" },
    { key: "lastUpdate", kind: "text", hint: "feld.zeitstempel" },
    { key: "minInterval", kind: "text", hint: "feld.dauer" },
    { key: "maxInterval", kind: "text", hint: "feld.dauer" },
  ]),

  submodelElement("Entity", [
    { key: "entityType", kind: "enum", enum: "EntityType", required: true },
    { key: "globalAssetId", kind: "text", hint: "feld.globalAssetId" },
    { key: "specificAssetIds", kind: "specificAssetIdList" },
  ]),

  submodelElement("SubmodelElementList", [
    { key: "typeValueListElement", kind: "enum", enum: "AasSubmodelElements", required: true },
    { key: "valueTypeListElement", kind: "enum", enum: "DataTypeDefXsd" },
    { key: "semanticIdListElement", kind: "reference" },
    { key: "orderRelevant", kind: "boolean", hint: "feld.orderRelevant" },
  ]),

  submodelElement("SubmodelElementCollection"),
];

// --- Rahmenelemente -----------------------------------------------------------------

const FRAME_ELEMENTS: ElementSpec[] = [
  {
    kind: "AssetAdministrationShell",
    groups: [
      referableGroup(IDENTIFIABLE),
      {
        title: "gruppe.asset",
        fields: [
          { key: "assetInformation", kind: "assetInformation", required: true },
          { key: "derivedFrom", kind: "reference", hint: "feld.derivedFrom" },
          { key: "submodels", kind: "referenceList", hint: "feld.submodels" },
        ],
      },
      VERWALTUNG_GROUP,
      EXTENSION_GROUP,
    ],
  },

  {
    kind: "Submodel",
    groups: [
      referableGroup(IDENTIFIABLE),
      { title: "gruppe.wert", fields: [{ key: "kind", kind: "enum", enum: "ModellingKind" }] },
      SEMANTIK_GROUP,
      QUALIFIER_GROUP,
      VERWALTUNG_GROUP,
      EXTENSION_GROUP,
    ],
  },

  {
    kind: "ConceptDescription",
    groups: [
      referableGroup(IDENTIFIABLE),
      {
        title: "gruppe.wert",
        fields: [{ key: "isCaseOf", kind: "referenceList", hint: "feld.isCaseOf" }],
      },
      VERWALTUNG_GROUP,
      EXTENSION_GROUP,
    ],
  },

  {
    kind: "Environment",
    groups: [],
  },
];

export const ELEMENT_SPECS: Readonly<Record<string, ElementSpec>> = Object.fromEntries(
  [...SUBMODEL_ELEMENTS, ...FRAME_ELEMENTS].map((spec) => [spec.kind, spec]),
);

export function specOf(kind: string): ElementSpec | undefined {
  return ELEMENT_SPECS[kind];
}

/**
 * Untermasken fuer die eingebetteten Objekte. Sie sind keine Baumknoten, brauchen aber
 * dieselbe datengetriebene Behandlung.
 */
export const NESTED_SPECS: Readonly<Record<string, readonly FieldSpec[]>> = {
  Qualifier: [
    { key: "type", kind: "text", required: true },
    { key: "valueType", kind: "enum", enum: "DataTypeDefXsd", required: true },
    { key: "value", kind: "text", typedBy: "valueType" },
    { key: "valueId", kind: "reference" },
    { key: "kind", kind: "enum", enum: "QualifierKind" },
    { key: "semanticId", kind: "reference" },
    { key: "supplementalSemanticIds", kind: "referenceList" },
  ],

  Extension: [
    { key: "name", kind: "text", required: true },
    { key: "valueType", kind: "enum", enum: "DataTypeDefXsd" },
    { key: "value", kind: "text", typedBy: "valueType" },
    { key: "refersTo", kind: "referenceList" },
    { key: "semanticId", kind: "reference" },
    { key: "supplementalSemanticIds", kind: "referenceList" },
  ],

  SpecificAssetId: [
    { key: "name", kind: "text", required: true },
    { key: "value", kind: "text", required: true },
    { key: "externalSubjectId", kind: "reference" },
    { key: "semanticId", kind: "reference" },
    { key: "supplementalSemanticIds", kind: "referenceList" },
  ],

  AdministrativeInformation: [
    { key: "version", kind: "text" },
    { key: "revision", kind: "text" },
    { key: "creator", kind: "reference" },
    { key: "templateId", kind: "text" },
    { key: "embeddedDataSpecifications", kind: "dataSpecificationList" },
  ],

  AssetInformation: [
    { key: "assetKind", kind: "enum", enum: "AssetKind", required: true },
    { key: "globalAssetId", kind: "text", hint: "feld.globalAssetId" },
    { key: "assetType", kind: "text" },
    { key: "specificAssetIds", kind: "specificAssetIdList" },
    { key: "defaultThumbnail", kind: "attachment" },
  ],

  Reference: [
    { key: "type", kind: "enum", enum: "ReferenceTypes", required: true },
    { key: "referredSemanticId", kind: "reference" },
    // `keys` bekommt einen eigenen Editor, es ist die Kernstruktur einer Reference.
  ],

  /**
   * Der Inhalt einer ConceptDescription nach IEC 61360.
   *
   * `value` und `valueList` schliessen sich gegenseitig aus, das fordert Constraint
   * AASc-3a-010. Beide stehen trotzdem in der Maske, denn welches von beiden gilt,
   * entscheidet der Inhalt, nicht das Formular. Die Validierung sagt es, wenn beides
   * gefuellt ist.
   */
  DataSpecificationIec61360: [
    { key: "preferredName", kind: "langStrings", required: true, hint: "feld.preferredName" },
    { key: "shortName", kind: "langStrings" },
    { key: "definition", kind: "langStrings", hint: "feld.definition" },
    { key: "dataType", kind: "enum", enum: "DataTypeIec61360", hint: "feld.dataTypeIec" },
    { key: "unit", kind: "text", hint: "feld.unit" },
    { key: "unitId", kind: "reference" },
    { key: "symbol", kind: "text" },
    { key: "valueFormat", kind: "text", hint: "feld.valueFormat" },
    { key: "value", kind: "text", hint: "feld.iecValue" },
    { key: "valueList", kind: "valueList", hint: "feld.valueList" },
    { key: "levelType", kind: "levelType", hint: "feld.levelType" },
    { key: "sourceOfDefinition", kind: "text" },
  ],

  ValueReferencePair: [
    { key: "value", kind: "text", required: true },
    { key: "valueId", kind: "reference", required: true, hint: "feld.valueId" },
  ],
};
