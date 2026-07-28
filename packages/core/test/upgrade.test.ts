import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import * as jsonization from "@aas-core-works/aas-core3.1-typescript/jsonization";
import * as xmlization from "@aas-core-works/aas-core3.1-typescript/xmlization";
import * as types from "@aas-core-works/aas-core3.1-typescript/types";
import * as jsonization30 from "@aas-core-works/aas-core3.0-typescript/jsonization";
import * as types30 from "@aas-core-works/aas-core3.0-typescript/types";

import {
  NAMESPACE_30,
  NAMESPACE_31,
  detectXmlVersion,
  upgradeJson,
  upgradeXml,
} from "../src/upgrade/v30ToV31.js";
import { loadCorpus, testDataRoot } from "./corpus.js";

/**
 * Jede Zeile von docs/metamodell-diff-3.0-3.1.md bekommt hier ihren Test.
 * Der Diff wurde aus den SDKs abgeleitet, diese Tests halten ihn fest.
 */

describe("Diff-Tabelle Zeile 1 bis 3: Klassen, Eigenschaften, Enums", () => {
  it("Zeile 1: beide SDKs kennen denselben Klassenbestand", () => {
    const namesOf = (mod: object) =>
      Object.keys(mod)
        .filter((key) => /^[A-Z]/.test(key))
        .sort();

    expect(namesOf(types30)).toEqual(namesOf(types));
  });

  it("Zeile 3: AssetKind ist additiv, 3.1 ergaenzt Role", () => {
    const values30 = Object.keys(types30.AssetKind).filter((k) => /^[A-Z]/.test(k));
    const values31 = Object.keys(types.AssetKind).filter((k) => /^[A-Z]/.test(k));

    for (const value of values30) expect(values31).toContain(value);
    expect(values31).toContain("Role");
    expect(values30).not.toContain("Role");
  });

  it("Zeile 2 und 8: jedes gueltige 3.0-JSON wird direkt von der 3.1-SDK gelesen", () => {
    const corpus = loadCorpus("3.0");
    expect(corpus.length).toBeGreaterThan(500);

    const failures: string[] = [];
    for (const entry of corpus) {
      // Gegenprobe: die 3.0-SDK muss es ebenfalls annehmen, sonst ist die Testdatei
      // selbst das Problem und nicht die Versionsdifferenz.
      const as30 = jsonization30.environmentFromJsonable(entry.environment);
      if (as30.error !== null) continue;

      const upgraded = upgradeJson(entry.environment);
      const as31 = jsonization.environmentFromJsonable(upgraded.value as jsonization.JsonValue);
      if (as31.error !== null) {
        failures.push(`${entry.name}: ${as31.error.message}`);
      }
    }

    expect(failures.slice(0, 10).join("\n")).toBe("");
  });
});

describe("Diff-Tabelle Zeile 7: XML-Namensraum", () => {
  const xmlRoot = join(
    testDataRoot,
    "aas-core3.0-xml/test_data/Xml/SelfContained/Expected/environment",
  );

  it("erkennt die Version am Namensraum", () => {
    expect(detectXmlVersion(`<environment xmlns="${NAMESPACE_30}"/>`)).toBe("3.0");
    expect(detectXmlVersion(`<environment xmlns="${NAMESPACE_31}"/>`)).toBe("3.1");
    expect(detectXmlVersion("<environment/>")).toBe("unbekannt");
  });

  it("laesst ein 3.1-Dokument unangetastet und meldet nichts", () => {
    const xml = `<environment xmlns="${NAMESPACE_31}"/>`;
    const result = upgradeXml(xml);
    expect(result.value).toBe(xml);
    expect(result.notes).toHaveLength(0);
  });

  it("hebt die offiziellen 3.0-XML-Testdaten auf 3.1 und liest sie danach ein", () => {
    expect(existsSync(xmlRoot), "3.0-XML-Testdaten fehlen, 'pnpm test-data' ausfuehren").toBe(true);

    const files = readdirSync(xmlRoot).filter((f) => f.endsWith(".xml"));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const original = readFileSync(join(xmlRoot, file), "utf8");
      expect(detectXmlVersion(original), file).toBe("3.0");

      // Ohne Upgrade lehnt die 3.1-SDK das Dokument ab. Genau deshalb gibt es den Tausch.
      expect(xmlization.fromXmlString(original).error, file).not.toBeNull();

      const upgraded = upgradeXml(original);
      expect(upgraded.notes.map((n) => n.rule)).toEqual(["7"]);

      const parsed = xmlization.fromXmlString(upgraded.value);
      expect(parsed.error?.message ?? null, `${file}: ${String(parsed.error?.path ?? "")}`).toBeNull();
      expect(parsed.mustValue()).toBeInstanceOf(types.Environment);
    }
  });

  it("laesst den Inhalt beim Namensraum-Tausch unveraendert", () => {
    const files = readdirSync(xmlRoot).filter((f) => f.endsWith(".xml"));
    const file = files[0] as string;
    const original = readFileSync(join(xmlRoot, file), "utf8");

    const upgraded = upgradeXml(original);
    expect(upgraded.value.split(NAMESPACE_31).join(NAMESPACE_30)).toBe(original);
  });
});

describe("Diff-Tabelle Zeile 4 bis 6: Constraints", () => {
  it("Zeile 5: 3.1 beanstandet einen idShort am Kind einer SubmodelElementList nicht mehr", async () => {
    const verification = await import("@aas-core-works/aas-core3.1-typescript/verification");

    const item = new types.Property(types.DataTypeDefXsd.String);
    item.idShort = "Eintrag";
    item.value = "1";

    const list = new types.SubmodelElementList(types.AasSubmodelElements.SubmodelElement);
    list.idShort = "Liste";
    list.typeValueListElement = types.AasSubmodelElements.Property;
    list.valueTypeListElement = types.DataTypeDefXsd.String;
    list.value = [item];

    const submodel = new types.Submodel("https://example.com/sm/1");
    submodel.idShort = "SM";
    submodel.submodelElements = [list];

    const env = new types.Environment();
    env.submodels = [submodel];

    const messages = [...verification.verify(env)].map((e) => e.message);
    expect(messages.some((m) => m.includes("AASd-120"))).toBe(false);
    expect(messages).toHaveLength(0);
  });

  it("Zeile 6: AASc-3a-002 heisst in 3.1 AASc-002", async () => {
    const v31 = await import("@aas-core-works/aas-core3.1-typescript/verification");
    const v30 = await import("@aas-core-works/aas-core3.0-typescript/verification");

    const messagesOf = (mod: object) => JSON.stringify(Object.keys(mod));
    expect(messagesOf(v31)).toBeTruthy();
    expect(messagesOf(v30)).toBeTruthy();

    // Ein ConceptDescription mit IEC-61360-Spezifikation ohne preferredName loest die
    // Regel aus. Die Kennung unterscheidet sich zwischen den Fassungen.
    const build31 = (): types.Environment => {
      const embedded = new types.EmbeddedDataSpecification(
        new types.Reference(types.ReferenceTypes.ExternalReference, [
          new types.Key(types.KeyTypes.GlobalReference, "https://example.com/spec"),
        ]),
        new types.DataSpecificationIec61360([]),
      );
      const cd = new types.ConceptDescription("https://example.com/cd/1");
      cd.embeddedDataSpecifications = [embedded];
      const env = new types.Environment();
      env.conceptDescriptions = [cd];
      return env;
    };

    const build30 = (): types30.Environment => {
      const embedded = new types30.EmbeddedDataSpecification(
        new types30.Reference(types30.ReferenceTypes.ExternalReference, [
          new types30.Key(types30.KeyTypes.GlobalReference, "https://example.com/spec"),
        ]),
        new types30.DataSpecificationIec61360([]),
      );
      const cd = new types30.ConceptDescription("https://example.com/cd/1");
      cd.embeddedDataSpecifications = [embedded];
      const env = new types30.Environment();
      env.conceptDescriptions = [cd];
      return env;
    };

    const errors31 = [...v31.verify(build31())].map((e) => e.message);
    const errors30 = [...v30.verify(build30())].map((e) => e.message);

    expect(errors30.some((m) => m.includes("AASc-3a-002"))).toBe(true);
    expect(errors31.some((m) => m.includes("AASc-002"))).toBe(true);
    expect(errors31.some((m) => m.includes("AASc-3a-002"))).toBe(false);
  });
});
