/**
 * Die eine Abbildung von AAS-Typ auf Farbton.
 *
 * Baum, Tabelle, Formular, Graph und Legende benutzen denselben Farbcode. Damit er nicht
 * an fuenf Stellen auseinanderlaeuft, gibt es genau diese Datei und in keiner Sicht ein
 * eigenes `switch`.
 */

export type Tone = "neutral" | "aas" | "sm" | "cd" | "warn" | "danger";

/**
 * Ton fuer Baumpunkt, Graphknoten und Formularkopf: die Farbe des tragenden Identifiable,
 * nicht die des einzelnen Elements. Deshalb faerben auch Collections gruen.
 */
export function toneOf(kind: string): Tone {
  switch (kind) {
    case "AssetAdministrationShell":
      return "aas";
    case "Submodel":
    case "SubmodelElementCollection":
    case "SubmodelElementList":
      return "sm";
    case "ConceptDescription":
      return "cd";
    default:
      return "neutral";
  }
}

/**
 * Ton fuer das Typ-Badge in der Tabelle. Feiner als `toneOf`: MultiLanguageProperty traegt
 * dort die AAS-Toene, weil das Mockup mehrsprachige Werte hervorhebt.
 */
export function badgeToneOf(kind: string): Tone {
  if (kind === "MultiLanguageProperty") return "aas";
  return toneOf(kind);
}

/** Kurzform fuer enge Spalten und Graphknoten. */
export function shortKind(kind: string): string {
  switch (kind) {
    case "AssetAdministrationShell":
      return "AAS";
    case "ConceptDescription":
      return "CD";
    case "MultiLanguageProperty":
      return "MLP";
    case "SubmodelElementCollection":
      return "SMC";
    case "SubmodelElementList":
      return "SML";
    case "AnnotatedRelationshipElement":
      return "AnnotatedRel";
    default:
      return kind;
  }
}

/**
 * Das Kuerzel vor dem Namen im Baum. Kuerzer als `shortKind`, weil es in jeder Zeile
 * steht und alle Namen sonst um die laengste Form herum einruecken muessten. Vier
 * Zeichen sind die Obergrenze, danach wird die Spalte breiter als die Einrueckung.
 */
const KUERZEL: Record<string, string> = {
  AssetAdministrationShell: "AAS",
  Submodel: "SM",
  ConceptDescription: "CD",
  Environment: "ENV",
  AnnotatedRelationshipElement: "ARel",
  BasicEventElement: "Evt",
  Blob: "Blob",
  Capability: "Cap",
  Entity: "Ent",
  File: "File",
  MultiLanguageProperty: "MLP",
  Operation: "Op",
  Property: "Prop",
  Range: "Rng",
  ReferenceElement: "Ref",
  RelationshipElement: "Rel",
  SubmodelElementCollection: "SMC",
  SubmodelElementList: "SML",
};

export function kuerzelOf(kind: string): string {
  return KUERZEL[kind] ?? kind.slice(0, 4);
}
