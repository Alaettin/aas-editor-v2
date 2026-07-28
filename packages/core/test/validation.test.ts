import { describe, expect, it } from "vitest";

import { normalize } from "../src/model/normalize.js";
import { getNode, walk } from "../src/model/store.js";
import { setField } from "../src/model/operations.js";
import { topLevelField, validate } from "../src/validation/index.js";
import type { Attachment } from "../src/io/types.js";

/**
 * Abnahme Phase 4, Satz fuer Satz aus Plan Abschnitt 11.
 */

function umgebung() {
  return normalize({
    assetAdministrationShells: [
      {
        id: "https://example.com/aas/1",
        idShort: "Pump",
        assetInformation: { assetKind: "Instance", globalAssetId: "https://example.com/asset/1" },
        modelType: "AssetAdministrationShell",
      },
    ],
    submodels: [
      {
        id: "https://example.com/sm/1",
        idShort: "TechnicalData",
        modelType: "Submodel",
        submodelElements: [
          { idShort: "Handbuch", contentType: "application/pdf", modelType: "File" },
        ],
      },
    ],
  });
}

describe("Live-Validierung", () => {
  it("meldet nichts bei einer gueltigen Umgebung", async () => {
    const model = umgebung();
    const anhang: Attachment = {
      path: "/aasx/files/x.pdf",
      contentType: "application/pdf",
      bytes: new Uint8Array([1]),
    };
    const issues = await validate(model, new Map([[anhang.path, anhang]]));
    expect(issues).toEqual([]);
  });

  it("haengt AASd-131 an die Shell und an das Feld assetInformation", async () => {
    const model = umgebung();
    const shell = [...walk(model)].find((n) => n.kind === "AssetAdministrationShell")!;
    // globalAssetId entfernen, das ist die Verletzung aus der Abnahme.
    const info = shell.data["assetInformation"] as Record<string, unknown>;
    delete info["globalAssetId"];

    const issues = await validate(model);
    const treffer = issues.filter((issue) => issue.constraintId === "AASd-131");
    expect(treffer).toHaveLength(1);

    const issue = treffer[0]!;
    expect(issue.severity).toBe("constraint");
    expect(issue.nodeId).toBe(shell.nodeId);
    expect(issue.field).toBe("assetInformation");
    expect(getNode(model, issue.nodeId as string).kind).toBe("AssetAdministrationShell");

    // Verstaendlich statt Spezifikationstext, Rohmeldung bleibt erhalten.
    expect(issue.translated).toBe(true);
    expect(issue.title).toContain("globalAssetId");
    expect(issue.message).toContain("Constraint AASd-131");
  });

  it("laesst den Fehler nach der Korrektur wieder verschwinden", async () => {
    const model = umgebung();
    const shell = [...walk(model)].find((n) => n.kind === "AssetAdministrationShell")!;
    const info = shell.data["assetInformation"] as Record<string, unknown>;
    delete info["globalAssetId"];

    expect((await validate(model)).some((i) => i.constraintId === "AASd-131")).toBe(true);

    info["globalAssetId"] = "https://example.com/asset/1";
    expect((await validate(model)).some((i) => i.constraintId === "AASd-131")).toBe(false);
  });

  it("meldet zwei Submodels mit gleichem idShort und verschiedener id NICHT", async () => {
    // Der Punkt aus Plan Abschnitt 6, an dem viele Implementierungen irren.
    const model = normalize({
      submodels: [
        { id: "https://example.com/sm/1", idShort: "Nameplate", modelType: "Submodel" },
        { id: "https://example.com/sm/2", idShort: "Nameplate", modelType: "Submodel" },
      ],
    });
    expect(await validate(model)).toEqual([]);
  });

  it("meldet dieselbe id zweimal sehr wohl, als Warnung", async () => {
    const model = normalize({
      submodels: [
        { id: "https://example.com/sm/1", idShort: "Erstes", modelType: "Submodel" },
        { id: "https://example.com/sm/1", idShort: "Zweites", modelType: "Submodel" },
      ],
    });
    const issues = await validate(model);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("warnung");
    expect(issues[0]!.title).toContain("https://example.com/sm/1");
  });

  it("warnt bei einem File-Element ohne Anhang, aber nicht als Constraint", async () => {
    const model = umgebung();
    const file = [...walk(model)].find((n) => n.kind === "File")!;
    setField(model, file.nodeId, "value", "/aasx/files/fehlt.pdf");

    const issues = await validate(model);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("warnung");
    expect(issues[0]!.nodeId).toBe(file.nodeId);
    expect(issues[0]!.message).toContain("/aasx/files/fehlt.pdf");
  });

  it("bildet einen tief liegenden Fehler auf das oberste Feld ab", () => {
    expect(topLevelField("qualifiers[0].value")).toBe("qualifiers");
    expect(topLevelField("assetInformation.globalAssetId")).toBe("assetInformation");
    expect(topLevelField("idShort")).toBe("idShort");
    expect(topLevelField("")).toBe("");
  });

  it("beanstandet einen zu kurzen idShort, das Muster verlangt zwei Zeichen", async () => {
    const model = normalize({
      submodels: [{ id: "https://example.com/sm/1", idShort: "A", modelType: "Submodel" }],
    });
    const issues = await validate(model);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("constraint");
    expect(issues[0]!.title).toContain("mindestens zwei Zeichen");
  });
});
