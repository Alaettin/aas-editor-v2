import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import type { JsonObject } from "@aas-core-works/aas-core3.1-typescript/jsonization";

/**
 * Zugriff auf die offiziellen aas-core-Testdaten. Sie liegen nicht im npm-Paket,
 * sondern werden mit `pnpm test-data` aus GitHub geholt (Plan Abschnitt 12).
 *
 * Die "Expected"-Dateien sind je Klasse abgelegt, nicht als Umgebungen. Nur der Ordner
 * `Environment` enthaelt vollstaendige Environments. Damit trotzdem alle Elementtypen
 * durch den Roundtrip laufen, werden die uebrigen Klassen hier in eine minimale
 * Umgebung eingebettet.
 */

const ROOT = join(import.meta.dirname, "../../..", "test-data");

export const testDataRoot = ROOT;

export function hasTestData(): boolean {
  return existsSync(join(ROOT, "aas-core3.1/test_data/Json/Expected/Environment"));
}

export interface CorpusEntry {
  /** Sprechender Name, etwa "Property/maximal.json" */
  readonly name: string;
  /** Vollstaendiges Environment als JSON-Objekt */
  readonly environment: JsonObject;
}

const IDENTIFIABLE_SLOT: Record<string, string> = {
  AssetAdministrationShell: "assetAdministrationShells",
  Submodel: "submodels",
  ConceptDescription: "conceptDescriptions",
};

const SUBMODEL_ELEMENTS = new Set([
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
]);

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (entry.name.endsWith(".json")) out.push(full);
  }
  return out;
}

/**
 * Alle gueltigen Testdaten als vollstaendige Environments.
 * Klassen, die im Baum nicht als Knoten vorkommen (Reference, Qualifier, LangString ...),
 * werden uebersprungen, sie sind ueber die Elemente ohnehin mit abgedeckt.
 */
export function loadCorpus(version: "3.1" | "3.0" = "3.1"): CorpusEntry[] {
  // Die beiden Repositories legen ihre Testdaten unterschiedlich ab: 3.1 je Klasse als
  // blosse Instanz, 3.0 zusaetzlich als fertig eingebettete Umgebung.
  const base =
    version === "3.0"
      ? join(ROOT, "aas-core3.0/test_data/Json/ContainedInEnvironment/Expected")
      : join(ROOT, "aas-core3.1/test_data/Json/Expected");
  const alreadyEnvironment = version === "3.0";
  const entries: CorpusEntry[] = [];

  for (const file of walkFiles(base)) {
    const name = relative(base, file).split(sep).join("/");
    const kind = name.split("/")[0] as string;
    const raw = JSON.parse(readFileSync(file, "utf8")) as JsonObject;

    if (alreadyEnvironment || kind === "Environment") {
      entries.push({ name, environment: raw });
      continue;
    }

    const slot = IDENTIFIABLE_SLOT[kind];
    if (slot) {
      entries.push({ name, environment: { [slot]: [raw] } });
      continue;
    }

    if (SUBMODEL_ELEMENTS.has(kind)) {
      entries.push({
        name,
        environment: {
          submodels: [
            {
              id: "https://example.com/testdaten/sm",
              submodelElements: [raw],
              modelType: "Submodel",
            },
          ],
        },
      });
    }
  }

  return entries;
}
