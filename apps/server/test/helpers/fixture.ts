/**
 * Ein Environment, das die Faelle enthaelt, an denen der Rundlauf scheitern koennte:
 * alle drei Listen, zwei Submodels mit gleichem idShort und verschiedener id (erlaubt,
 * AASd-022 gilt nur fuer non-identifiable Referables), eine verschachtelte Collection,
 * eine Operation mit ihrer OperationVariable-Huelle, ein File-Element mit Paketpfad und
 * ein Fremdfeld auf der Wurzel.
 */
export function beispielEnvironment(): Record<string, unknown> {
  return {
    fremdfeldDerWurzel: { hinweis: "muss den Rundlauf ueberleben" },
    assetAdministrationShells: [
      {
        modelType: "AssetAdministrationShell",
        id: "https://example.com/shells/1",
        idShort: "Maschine",
        assetInformation: { assetKind: "Instance", globalAssetId: "https://example.com/asset/1" },
        submodels: [
          {
            type: "ModelReference",
            keys: [{ type: "Submodel", value: "https://example.com/submodels/1" }],
          },
        ],
      },
    ],
    submodels: [
      {
        modelType: "Submodel",
        id: "https://example.com/submodels/1",
        idShort: "Typenschild",
        submodelElements: [
          { modelType: "Property", idShort: "Hersteller", valueType: "xs:string", value: "Dogan" },
          {
            modelType: "SubmodelElementCollection",
            idShort: "Adresse",
            value: [
              { modelType: "Property", idShort: "Ort", valueType: "xs:string", value: "Koeln" },
            ],
          },
          {
            modelType: "File",
            idShort: "Datenblatt",
            contentType: "application/pdf",
            value: "/aasx/dokumente/datenblatt.pdf",
          },
          {
            modelType: "Operation",
            idShort: "Starten",
            inputVariables: [
              {
                value: {
                  modelType: "Property",
                  idShort: "Drehzahl",
                  valueType: "xs:int",
                  value: "1500",
                },
              },
            ],
          },
        ],
      },
      {
        modelType: "Submodel",
        id: "https://example.com/submodels/2",
        idShort: "Typenschild",
        submodelElements: [],
      },
    ],
    conceptDescriptions: [
      {
        modelType: "ConceptDescription",
        id: "https://example.com/cd/1",
        idShort: "HerstellerBegriff",
      },
    ],
  };
}

/** Vergleich unabhaengig von der Schluesselreihenfolge im JSON-Objekt. */
export function kanonisch(value: unknown): string {
  const sortiere = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sortiere);
    if (typeof input !== "object" || input === null) return input;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(input as Record<string, unknown>).sort()) {
      out[key] = sortiere((input as Record<string, unknown>)[key]);
    }
    return out;
  };
  return JSON.stringify(sortiere(value));
}
