import { describe, expect, it } from "vitest";
import * as types from "@aas-core-works/aas-core3.1-typescript/types";
import * as verification from "@aas-core-works/aas-core3.1-typescript/verification";

import { fromAasCore } from "../src/model/aasCore.js";
import { buildPathIndex, resolvePath } from "../src/model/paths.js";
import { getNode } from "../src/model/store.js";

/**
 * Die Pfad-Abbildung ist laut Plan Abschnitt 7 das Herzstueck der Live-Validierung.
 * Sie wird hier gegen echte Meldungen von verification.verify() geprueft, nicht gegen
 * ausgedachte Pfade.
 */

function buildBrokenEnvironment(): types.Environment {
  const prop = new types.Property(types.DataTypeDefXsd.String);
  prop.idShort = "nicht erlaubt mit Leerzeichen";
  prop.value = "80";

  const coll = new types.SubmodelElementCollection();
  coll.idShort = "Limits";
  coll.value = [prop];

  const operation = new types.Operation();
  operation.idShort = "Starten";
  const inner = new types.Property(types.DataTypeDefXsd.Boolean);
  inner.idShort = "auch nicht erlaubt";
  operation.inputVariables = [new types.OperationVariable(inner)];

  const submodel = new types.Submodel("https://example.com/sm/1");
  submodel.idShort = "TechnicalData";
  submodel.submodelElements = [coll, operation];

  // AssetInformation ohne globalAssetId verletzt AASd-131
  const assetInfo = new types.AssetInformation(types.AssetKind.Instance);
  const shell = new types.AssetAdministrationShell("https://example.com/aas/1", assetInfo);
  shell.idShort = "Pump";

  const env = new types.Environment();
  env.assetAdministrationShells = [shell];
  env.submodels = [submodel];
  return env;
}

describe("Pfad-Abbildung", () => {
  const env = buildBrokenEnvironment();
  const model = fromAasCore(env);
  const index = buildPathIndex(model);

  it("ordnet jeden Verifikationsfehler einem Knoten und einem Feld zu", () => {
    const errors = [...verification.verify(env)];
    expect(errors.length).toBeGreaterThanOrEqual(3);

    for (const error of errors) {
      const location = resolvePath(index, String(error.path));
      expect(location, `nicht zuordenbar: ${String(error.path)}`).not.toBeNull();
    }
  });

  it("haengt AASd-131 an die Shell und das Feld assetInformation", () => {
    const error = [...verification.verify(env)].find((e) => e.message.includes("AASd-131"));
    expect(error).toBeDefined();

    const location = resolvePath(index, String(error!.path));
    expect(location).not.toBeNull();
    expect(getNode(model, location!.nodeId).kind).toBe("AssetAdministrationShell");
    expect(location!.field).toBe("assetInformation");
  });

  it("trifft ein Element in einer Collection genau, nicht nur dessen Elternteil", () => {
    const location = resolvePath(index, ".submodels[0].submodelElements[0].value[0].idShort");
    expect(location).not.toBeNull();
    const node = getNode(model, location!.nodeId);
    expect(node.kind).toBe("Property");
    expect(node.data["idShort"]).toBe("nicht erlaubt mit Leerzeichen");
    expect(location!.field).toBe("idShort");
  });

  it("loest die unsichtbare OperationVariable-Huelle mit auf", () => {
    const location = resolvePath(
      index,
      ".submodels[0].submodelElements[1].inputVariables[0].value.idShort",
    );
    expect(location).not.toBeNull();
    const node = getNode(model, location!.nodeId);
    expect(node.kind).toBe("Property");
    expect(node.data["idShort"]).toBe("auch nicht erlaubt");
    expect(location!.field).toBe("idShort");
  });

  it("faellt auf den naechsten bekannten Vorfahren zurueck", () => {
    // Ein Pfad, dessen Blatt der Editor nicht als Knoten fuehrt, darf nicht verloren
    // gehen. Er landet am naechsthoeheren Knoten, der Rest bleibt als Feldangabe.
    expect(resolvePath(index, ".submodels[9].idShort")).toEqual({
      nodeId: model.rootId,
      field: "submodels[9].idShort",
    });
  });
});
