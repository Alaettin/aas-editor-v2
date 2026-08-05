import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
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

  it("haelt Farbwerte aus dem Programmcode heraus", () => {
    // Die Regel galt bisher nur fuer den Keyvisual-Ordner. Sie gilt fuer alles: eine Farbe
    // im Bauteil wandert im Dunkelmodus nicht mit und faellt in keinem Kontrastdurchgang
    // auf. Genau so entstand das feste Cyan in der Anmeldung, obwohl es dafuer laengst ein
    // Token gab.
    //
    // Ausgenommen sind `styles/` (dort **stehen** die Werte) und `components/ui/`
    // (Fremdcode von shadcn, siehe die Hausregel in tokens.css).
    const wurzel = fileURLToPath(new URL("../src", import.meta.url));
    const treffer: string[] = [];

    const durchgehen = (ordner: string): void => {
      for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
        const voll = join(ordner, eintrag.name);
        const relativ = voll
          .slice(wurzel.length + 1)
          .split(sep)
          .join("/");
        if (relativ.startsWith("styles") || relativ.startsWith("components/ui")) continue;
        if (eintrag.isDirectory()) {
          durchgehen(voll);
          continue;
        }
        if (!/\.tsx?$/.test(eintrag.name)) continue;

        const zeilen = readFileSync(voll, "utf8").split(/\r?\n/);
        for (const [nummer, zeile] of zeilen.entries()) {
          const roh = zeile.trimStart();
          if (roh.startsWith("*") || roh.startsWith("//")) continue;
          // Erlaubt bleibt `rgb(var(--token) / ...)`: das ist der Weg, auf dem ein
          // Kanaltripel aus den Tokens eine eigene Deckkraft bekommt.
          if (/#[0-9a-fA-F]{3,8}\b/.test(zeile) || /\brgba?\(\s*[\d.]/.test(zeile)) {
            treffer.push(`${relativ}:${String(nummer + 1)}  ${zeile.trim()}`);
          }
        }
      }
    };

    durchgehen(wurzel);
    expect(treffer).toEqual([]);
  });
});
