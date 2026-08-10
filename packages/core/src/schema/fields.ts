import type { EnumName } from "./enums.js";

/**
 * Beschreibung eines Formularfeldes.
 *
 * Die Masken werden datengetrieben aus diesen Beschreibungen erzeugt, nicht 14-mal von
 * Hand geschrieben (Plan Abschnitt 5). Ein Sprung auf Metamodell 3.2 kostet dann eine
 * Zeile je neuem Feld statt einer neuen Komponente.
 */

export type FieldKind =
  /** Einzeiliger Text: idShort, id, value, contentType, messageTopic */
  | "text"
  /** Mehrzeiliger Text */
  | "textarea"
  /** Auswahl aus einer Aufzaehlung des Metamodells */
  | "enum"
  /** Ja oder Nein, etwa orderRelevant */
  | "boolean"
  /** Sprachabhaengige Texte: displayName, description, MultiLanguageProperty.value */
  | "langStrings"
  /** Eine einzelne Reference: semanticId, valueId, first, second, observed */
  | "reference"
  /** Liste von References: supplementalSemanticIds, submodels, isCaseOf */
  | "referenceList"
  /** Qualifier-Liste mit eigener Untermaske */
  | "qualifierList"
  /** Extension-Liste mit eigener Untermaske */
  | "extensionList"
  /** SpecificAssetId-Liste mit eigener Untermaske */
  | "specificAssetIdList"
  /** AdministrativeInformation als eingebettetes Objekt */
  | "administration"
  /** AssetInformation als eingebettetes Objekt */
  | "assetInformation"
  /** File: Paketpfad plus Anhang aus der Pfad-auf-Bytes-Map */
  | "attachment"
  /**
   * `Resource` als eingebettetes Objekt: `path` und `contentType`.
   *
   * `defaultThumbnail` stand bis zum 10.08.2026 als `attachment` hier, also als blosser
   * Pfad. Das ist falsch: im Metamodell ist es eine **Resource**, und der Editor zeigte
   * deshalb ein leeres Feld an und haette beim Schreiben eine Zeichenkette an die Stelle
   * eines Objekts gesetzt.
   */
  | "resource"
  /** Blob: Inhalt im Modell selbst, base64 */
  | "blob"
  /** EmbeddedDataSpecification-Liste, samt DataSpecificationIec61360 */
  | "dataSpecificationList"
  /** ValueList einer DataSpecificationIec61360: Wertepaare aus Wert und valueId */
  | "valueList"
  /** LevelType: vier Flaggen min, nom, typ, max */
  | "levelType";

export interface FieldSpec {
  /** Schluessel im JSON und in `node.data`, identisch zum Namen in aas-core */
  readonly key: string;
  readonly kind: FieldKind;
  /** i18n-Schluessel des Hilfetextes, falls das Feld einen verdient */
  readonly hint?: string;
  /** Pflichtfeld laut Metamodell */
  readonly required?: boolean;
  /**
   * Im Metamodell als veraltet gekennzeichnet. Der Deskriptor behaelt das Feld: der
   * Rundlauf und `schema.test.ts` haengen daran. Nur die Oberflaeche blendet es aus,
   * solange nichts drinsteht.
   */
  readonly deprecated?: boolean;
  /** Nur fuer `kind: "enum"` */
  readonly enum?: EnumName;
  /**
   * Nur fuer `Property.value`, `Range.min` und `Range.max`: das Eingabefeld richtet sich
   * nach dem hier genannten Geschwisterfeld, das den xsd-Typ traegt.
   */
  readonly typedBy?: string;
}

export interface FieldGroupSpec {
  /** i18n-Schluessel der Ueberschrift */
  readonly title: string;
  readonly fields: readonly FieldSpec[];
}

export interface ElementSpec {
  /** aas-core-Klassenname, entspricht `modelType` */
  readonly kind: string;
  readonly groups: readonly FieldGroupSpec[];
}

/** Alle Felder eines Deskriptors, ueber die Gruppen hinweg. */
export function fieldsOf(spec: ElementSpec): FieldSpec[] {
  return spec.groups.flatMap((group) => group.fields);
}

export function findField(spec: ElementSpec, key: string): FieldSpec | undefined {
  for (const group of spec.groups) {
    const field = group.fields.find((f) => f.key === key);
    if (field) return field;
  }
  return undefined;
}
