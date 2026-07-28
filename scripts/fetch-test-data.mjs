#!/usr/bin/env node
/**
 * Holt die offiziellen aas-core-Testdaten per Sparse-Checkout nach ./test-data.
 * Die Daten liegen nicht im npm-Paket, nur im GitHub-Repository (Plan Abschnitt 12).
 *
 *   node scripts/fetch-test-data.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "test-data");

const sources = [
  {
    dir: "aas-core3.1",
    repo: "https://github.com/aas-core-works/aas-core3.1-typescript.git",
    paths: ["test_data/Json", "test_data/Xml"],
  },
  {
    dir: "aas-core3.0",
    repo: "https://github.com/aas-core-works/aas-core3.0-typescript.git",
    paths: ["test_data/Json"],
  },
  {
    // Die 3.0-TypeScript-SDK bringt kein xmlization mit und ihr Repo folglich keine
    // XML-Testdaten. Fuer den 3.0-XML-Pfad wird deshalb der Bestand der Python-SDK
    // genutzt, die Testdaten sind zwischen den Sprachen identisch.
    dir: "aas-core3.0-xml",
    repo: "https://github.com/aas-core-works/aas-core3.0-python.git",
    paths: ["test_data/Xml/SelfContained/Expected/environment"],
  },
];

const git = (args, cwd) => execFileSync("git", args, { cwd, stdio: "inherit" });

mkdirSync(target, { recursive: true });

for (const source of sources) {
  const dest = join(target, source.dir);
  if (existsSync(dest)) {
    console.log(`${source.dir}: bereits vorhanden, wird neu geholt`);
    rmSync(dest, { recursive: true, force: true });
  }

  console.log(`${source.dir}: Sparse-Checkout aus ${source.repo}`);
  git(["clone", "--filter=blob:none", "--no-checkout", "--depth", "1", source.repo, dest]);
  git(["sparse-checkout", "set", "--no-cone", ...source.paths], dest);
  git(["checkout"], dest);
  rmSync(join(dest, ".git"), { recursive: true, force: true });
}

console.log(`\nTestdaten liegen in ${target}. Der Ordner ist gitignoriert.`);
