import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Der Dunkelmodus ist eine eigene Rampe, keine Invertierung. Genau deshalb kann er
 * auseinanderlaufen: eine neue Farbe wird oben ergaenzt und unten vergessen, und der
 * Fehler zeigt sich erst, wenn jemand umschaltet.
 *
 * Dieser Test ist der einzige mechanische Schutz dagegen.
 */

const QUELLE = readFileSync(
  fileURLToPath(new URL("../src/styles/tokens.css", import.meta.url)),
  "utf8",
);

function eigenschaften(selektor: string): Set<string> {
  const start = QUELLE.indexOf(`${selektor} {`);
  expect(start, `Block ${selektor} fehlt`).toBeGreaterThan(-1);
  const ende = QUELLE.indexOf("\n}", start);
  const block = QUELLE.slice(start, ende);
  return new Set([...block.matchAll(/^\s{2}(--[a-z0-9-]+):/gm)].map((treffer) => treffer[1]!));
}

describe("Design-Tokens", () => {
  it("fuehrt in hell und dunkel dieselben Namen", () => {
    const hell = eigenschaften(":root");
    const dunkel = eigenschaften(".dark");

    const nurHell = [...hell].filter((name) => !dunkel.has(name));
    const nurDunkel = [...dunkel].filter((name) => !hell.has(name));

    expect({ nurHell, nurDunkel }).toEqual({ nurHell: [], nurDunkel: [] });
  });

  it("haelt die AXON-Markenfarben unveraendert", () => {
    // Markenvorgabe, nicht berechnet. Aendert sie jemand, soll es auffallen.
    expect(QUELLE).toContain("--type-aas: #1c5db3;");
    expect(QUELLE).toContain("--type-sm: #00a587;");
    expect(QUELLE).toContain("--type-cd: #8d3cc6;");
    expect(QUELLE).toContain("--warning: #f77039;");
  });

  it("haelt die Buehne der Anmeldung ausserhalb der Themenrampe", () => {
    expect(QUELLE).toContain(".szene-axon {");
    expect(QUELLE).toContain("--axon-grund: #1858b0;");
    expect(QUELLE).toContain("--axon-aktion: #00a386;");
    expect(QUELLE).toContain("--axon-fokus: #00fdfd;");

    // Sie duerfen nicht in die Rampe wandern: das Keyvisual kennt keinen Dunkelmodus, und
    // ein Verschieben nach oben wuerde die Namensgleichheit erst scheinbar reparieren.
    const inRampe = [...eigenschaften(":root"), ...eigenschaften(".dark")].filter((name) =>
      name.startsWith("--axon-"),
    );
    expect(inRampe).toEqual([]);
  });

  it("laesst primary auf der Typfarbe der Shell liegen", () => {
    // Genau eine Akzentfarbe, und sie ist keine zweite Wahrheit neben den Typfarben.
    expect(QUELLE).toContain("--primary: var(--type-aas);");
  });
});
