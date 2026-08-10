import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import * as jsonization from "@aas-core-works/aas-core3.1-typescript/jsonization";
import * as types from "@aas-core-works/aas-core3.1-typescript/types";

import { toCanonicalJson, toAasCore } from "../src/model/aasCore.js";
import { exportFile, importFile } from "../src/io/index.js";
import { detectFormat, detectVersion } from "../src/io/detect.js";
import { findDuplicateIdShorts, findDuplicateIds, planMerge } from "../src/io/collisions.js";
import { normalize } from "../src/model/normalize.js";
import type { Attachment } from "../src/io/types.js";
import { loadCorpus, testDataRoot } from "./corpus.js";
import { wirftSchluessel, wirftSchluesselAsync } from "./schluessel.js";

/**
 * Abnahme Phase 2: alle drei Formate in beide Richtungen, AASX inklusive Anhaengen
 * und Thumbnail, und eine 3.0-Datei kommt als gueltige 3.1-Umgebung an.
 */

const encoder = new TextEncoder();

function sampleEnvironment(): types.Environment {
  // Achtung: der erste Konstruktorparameter der SDK-Klassen ist `extensions`,
  // nicht der offensichtliche Wert. Felder deshalb einzeln setzen.
  const file = new types.File();
  file.idShort = "Handbuch";
  file.contentType = "application/pdf";
  file.value = "/aasx/files/handbuch.pdf";

  const property = new types.Property(types.DataTypeDefXsd.String);
  property.idShort = "MaxTemperature";
  property.value = "80";

  const submodel = new types.Submodel("https://example.com/sm/1");
  submodel.idShort = "TechnicalData";
  submodel.submodelElements = [property, file];

  const assetInfo = new types.AssetInformation(types.AssetKind.Instance);
  assetInfo.globalAssetId = "https://example.com/asset/1";
  const shell = new types.AssetAdministrationShell("https://example.com/aas/1", assetInfo);
  shell.idShort = "Pump";

  const env = new types.Environment();
  env.assetAdministrationShells = [shell];
  env.submodels = [submodel];
  return env;
}

const handbuch: Attachment = {
  path: "/aasx/files/handbuch.pdf",
  contentType: "application/pdf",
  bytes: encoder.encode("%PDF-1.4 Dies ist kein echtes PDF, aber echte Bytes."),
};

const thumbnail: Attachment = {
  path: "/thumbnail.png",
  contentType: "image/png",
  bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]),
};

describe("Formaterkennung", () => {
  it("erkennt JSON, XML und AASX am Inhalt, nicht an der Endung", () => {
    expect(detectFormat(encoder.encode('  \n{"a":1}'))).toBe("json");
    expect(detectFormat(encoder.encode('<?xml version="1.0"?><environment/>'))).toBe("xml");
    expect(detectFormat(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0]))).toBe("aasx");
  });

  it("uebergeht ein UTF-8-BOM", () => {
    const withBom = Uint8Array.from([0xef, 0xbb, 0xbf, ...encoder.encode("{}")]);
    expect(detectFormat(withBom)).toBe("json");
  });

  it("sagt bei JSON ehrlich, dass es keinen Versionsmarker gibt", () => {
    expect(detectVersion("json", "{}")).toBe("unbekannt");
    expect(detectVersion("xml", '<environment xmlns="https://admin-shell.io/aas/3/0"/>')).toBe(
      "3.0",
    );
  });

  it("weist Unlesbares mit einer verstaendlichen Meldung zurueck", () => {
    wirftSchluessel(() => detectFormat(encoder.encode("nur Text")), "datei.formatUnbekannt");
  });
});

describe("Roundtrip JSON und XML", () => {
  const env = sampleEnvironment();
  const canonical = toCanonicalJson(env);

  it("JSON geht unveraendert hin und zurueck", async () => {
    const exported = await exportFile({ model: importModel(env), format: "json" });
    const imported = await importFile(exported.bytes, "environment.json");
    expect(imported.format).toBe("json");
    expect(toCanonicalJson(toAasCore(imported.model))).toBe(canonical);
  });

  it("XML geht unveraendert hin und zurueck", async () => {
    const exported = await exportFile({ model: importModel(env), format: "xml" });
    const imported = await importFile(exported.bytes, "environment.xml");
    expect(imported.format).toBe("xml");
    expect(imported.sourceVersion).toBe("3.1");
    expect(toCanonicalJson(toAasCore(imported.model))).toBe(canonical);
  });

  it("ist ueber zwei Runden byte-stabil", async () => {
    const first = await exportFile({ model: importModel(env), format: "xml" });
    const back = await importFile(first.bytes);
    const second = await exportFile({ model: back.model, format: "xml" });
    expect(second.bytes).toEqual(first.bytes);
  });
});

describe("Roundtrip AASX", () => {
  it("erhaelt Anhaenge und Thumbnail unveraendert", async () => {
    const env = sampleEnvironment();
    const model = importModel(env);

    const exported = await exportFile({
      model,
      format: "aasx",
      attachments: new Map([[handbuch.path, handbuch]]),
      thumbnail,
    });

    expect(detectFormat(exported.bytes)).toBe("aasx");

    const imported = await importFile(exported.bytes, "environment.aasx");
    expect(imported.format).toBe("aasx");
    expect(toCanonicalJson(toAasCore(imported.model))).toBe(toCanonicalJson(env));

    const back = imported.attachments.get(handbuch.path);
    expect(back, "Anhang fehlt nach dem Roundtrip").toBeDefined();
    expect(back!.bytes).toEqual(handbuch.bytes);
    expect(back!.contentType).toBe(handbuch.contentType);

    expect(imported.thumbnail).not.toBeNull();
    expect(imported.thumbnail!.bytes).toEqual(thumbnail.bytes);

    // Der Anhang ist da, also darf es keine Warnung ueber ein fehlendes File geben.
    expect(imported.warnings).toHaveLength(0);
  });

  it("warnt, wenn ein File-Element ins Leere zeigt", async () => {
    const env = sampleEnvironment();
    const exported = await exportFile({ model: importModel(env), format: "aasx" });
    const imported = await importFile(exported.bytes);

    expect(imported.warnings).toHaveLength(1);
    expect(imported.warnings[0]!.kind).toBe("fehlender-anhang");
    expect(imported.warnings[0]!.schluessel).toBe("warnung.fehlenderAnhang");
    expect(imported.warnings[0]!.werte["pfad"]).toBe("/aasx/files/handbuch.pdf");
    expect(imported.warnings[0]!.path).toBe(".submodels[0].submodelElements[1]");
  });
});

describe("Import einer 3.0-Datei", () => {
  const xmlRoot = join(
    testDataRoot,
    "aas-core3.0-xml/test_data/Xml/SelfContained/Expected/environment",
  );

  it("liest 3.0-XML und liefert eine gueltige 3.1-Umgebung", async () => {
    const files = readdirSync(xmlRoot).filter((f) => f.endsWith(".xml"));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const bytes = readFileSync(join(xmlRoot, file));
      const imported = await importFile(new Uint8Array(bytes), file);

      expect(imported.sourceVersion, file).toBe("3.0");
      expect(
        imported.upgradeNotes.map((n) => n.rule),
        file,
      ).toEqual(["7"]);

      // Das Ergebnis muss ohne weiteres Zutun als 3.1 exportierbar sein.
      const exported = await exportFile({ model: imported.model, format: "json" });
      const again = jsonization.environmentFromJsonable(
        JSON.parse(new TextDecoder().decode(exported.bytes)),
      );
      expect(again.error?.message ?? null, file).toBeNull();
    }
  });

  it("liest 3.0-JSON direkt als 3.1", async () => {
    const corpus = loadCorpus("3.0").slice(0, 200);
    for (const entry of corpus) {
      const bytes = encoder.encode(JSON.stringify(entry.environment));
      const imported = await importFile(bytes, entry.name);
      expect(imported.format, entry.name).toBe("json");
      expect(imported.sourceVersion, entry.name).toBe("unbekannt");
    }
  });
});

/*
 * Der Prolog eines XML-Dokuments.
 *
 * Der Leser der SDK erwartet als erstes Token ein Startelement und lehnt eine
 * XML-Deklaration ab, weil sie eine Processing Instruction ist. Aufgefallen ist das erst
 * an zwei echten Herstellerdateien (10.08.2026): jede eigene Datei lief durch, denn
 * `toXmlString` schreibt **keine** Deklaration, und die offiziellen Testdaten tun es auch
 * nicht. Fremde Werkzeuge schreiben sie praktisch immer.
 */
describe("XML-Prolog", () => {
  const kern =
    '<environment xmlns="https://admin-shell.io/aas/3/1">' +
    "<submodels><submodel><id>https://example.com/sm/1</id>" +
    "<idShort>Typenschild</idShort></submodel></submodels>" +
    "</environment>";

  const faelle: readonly (readonly [string, string])[] = [
    ["nackt", kern],
    ["mit Deklaration", `<?xml version="1.0" encoding="utf-8"?>${kern}`],
    ["Deklaration mit Zeilenumbruch", `<?xml version="1.0" encoding="UTF-8"?>\n${kern}`],
    ["BOM und Deklaration", `\uFEFF<?xml version="1.0"?>${kern}`],
    ["Kommentar davor", `<!-- erzeugt von irgendwem -->${kern}`],
    ["DOCTYPE davor", `<?xml version="1.0"?><!DOCTYPE environment>${kern}`],
    ["mehrere Anweisungen", `<?xml version="1.0"?><?xml-stylesheet href="a.xsl"?>${kern}`],
  ];

  for (const [name, xml] of faelle) {
    it(`liest ein Dokument ${name}`, async () => {
      const imported = await importFile(encoder.encode(xml), "geraet.xml");
      expect(imported.format).toBe("xml");
      const submodels = imported.model.nodes[imported.model.rootId]?.children["submodels"];
      expect(submodels?.length, name).toBe(1);
    });
  }

  it("laesst kaputtes XML von der SDK melden, statt es selbst zu verschlucken", async () => {
    // Ein unabgeschlossener Prolog ist kein Prolog. Der Text bleibt, wie er ist, und die
    // Meldung kommt aus der SDK: sie sagt genauer, was fehlt.
    await wirftSchluesselAsync(
      () => importFile(encoder.encode(`<?xml version="1.0"${kern}`), "kaputt.xml"),
      "datei.xmlUnlesbar",
    );
  });
});

describe("Eindeutigkeit und Kollisionen", () => {
  const zweiSubmodelsGleicherIdShort = normalize({
    submodels: [
      { id: "https://example.com/sm/1", idShort: "Nameplate", modelType: "Submodel" },
      { id: "https://example.com/sm/2", idShort: "Nameplate", modelType: "Submodel" },
    ],
  });

  it("meldet gleichen idShort bei verschiedener id NICHT", () => {
    // Plan Abschnitt 6: AASd-022 gilt nicht fuer Identifiables. Genau hier irren viele.
    expect(findDuplicateIds(zweiSubmodelsGleicherIdShort)).toHaveLength(0);
    expect(findDuplicateIdShorts(zweiSubmodelsGleicherIdShort)).toHaveLength(0);
  });

  it("meldet dieselbe id zweimal als Fehler", () => {
    const model = normalize({
      submodels: [
        { id: "https://example.com/sm/1", idShort: "A", modelType: "Submodel" },
        { id: "https://example.com/sm/1", idShort: "B", modelType: "Submodel" },
      ],
    });
    const conflicts = findDuplicateIds(model);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.nodeIds).toHaveLength(2);
  });

  it("meldet doppelten idShort unter non-identifiable Geschwistern", () => {
    const model = normalize({
      submodels: [
        {
          id: "https://example.com/sm/1",
          modelType: "Submodel",
          submodelElements: [
            { idShort: "Wert", valueType: "xs:string", modelType: "Property" },
            { idShort: "Wert", valueType: "xs:string", modelType: "Property" },
          ],
        },
      ],
    });
    expect(findDuplicateIdShorts(model)).toHaveLength(1);
  });

  it("laesst doppelte idShorts in einer SubmodelElementList zu, dort zaehlt der Index", () => {
    const model = normalize({
      submodels: [
        {
          id: "https://example.com/sm/1",
          modelType: "Submodel",
          submodelElements: [
            {
              idShort: "Liste",
              typeValueListElement: "Property",
              modelType: "SubmodelElementList",
              value: [
                { idShort: "Wert", valueType: "xs:string", modelType: "Property" },
                { idShort: "Wert", valueType: "xs:string", modelType: "Property" },
              ],
            },
          ],
        },
      ],
    });
    expect(findDuplicateIdShorts(model)).toHaveLength(0);
  });

  it("plant den Import in eine bestehende Umgebung nur ueber die id", () => {
    const bestehend = normalize({
      submodels: [{ id: "https://example.com/sm/1", idShort: "A", modelType: "Submodel" }],
    });
    const neu = normalize({
      submodels: [
        { id: "https://example.com/sm/1", idShort: "Anders", modelType: "Submodel" },
        { id: "https://example.com/sm/9", idShort: "A", modelType: "Submodel" },
      ],
    });

    const plan = planMerge(bestehend, neu);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.id).toBe("https://example.com/sm/1");
  });
});

function importModel(env: types.Environment) {
  return normalize(jsonization.toJsonable(env) as Record<string, never>);
}
