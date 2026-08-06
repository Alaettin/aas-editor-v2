import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Wachen ueber die Farbordnung.
 *
 * Bis zum 06.08.2026 stand hier vor allem der Abgleich zweier Rampen. Es gibt nur noch
 * eine, und die Gefahr hat sich verschoben: die Markenfarben stehen jetzt an **zwei**
 * Orten, in der Rampe und in `.szene-axon`. Laufen sie auseinander, sieht die Anmeldung
 * anders aus als der Rest, und niemand merkt es beim Arbeiten an einer der beiden Stellen.
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
  it("fuehrt genau eine Rampe", () => {
    // Ein wiederkehrender `.dark`-Block waere der Rueckfall in zwei Erscheinungen.
    expect(QUELLE).not.toContain(".dark {");
    expect(eigenschaften(":root").size).toBeGreaterThan(50);
  });

  it("haelt die AXON-Markenfarben unveraendert", () => {
    // Markenvorgabe, nicht berechnet. Aendert sie jemand, soll es auffallen.
    expect(QUELLE).toContain("--type-aas: #00fdfd;");
    expect(QUELLE).toContain("--type-sm: #00a386;");
    expect(QUELLE).toContain("--type-cd: #e0b0e0;");
    expect(QUELLE).toContain("--warning: #f06a38;");
  });

  it("sagt in Rampe und Anmeldebuehne dasselbe ueber die Marke", () => {
    expect(QUELLE).toContain(".szene-axon {");
    expect(QUELLE).toContain("--axon-grund: #1858b0;");

    // Cyan und Gruen stehen an zwei Orten. Weichen sie voneinander ab, sieht die Anmeldung
    // anders aus als die Anwendung, und beim Arbeiten an einer Stelle faellt es nie auf.
    const wert = (name: string) => QUELLE.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6});`))?.[1];
    expect(wert("--axon-fokus")).toBe(wert("--type-aas"));
    expect(wert("--axon-aktion")).toBe(wert("--type-sm"));
    expect(wert("--axon-strom-pink")).toBe(wert("--type-cd"));
    expect(wert("--axon-strom-orange")).toBe(wert("--warning"));

    // Die Buehnenwerte duerfen trotzdem nicht in die Rampe wandern: sie tragen die
    // Kanaltripel des Canvas, die als Oberflaechenfarben nichts zu suchen haetten.
    const inRampe = [...eigenschaften(":root")].filter((name) => name.startsWith("--axon-"));
    expect(inRampe).toEqual([]);
  });

  it("laesst primary auf dem Aktionsgruen liegen", () => {
    // Genau eine Akzentfarbe, und sie ist keine zweite Wahrheit neben den Typfarben.
    // Bis zum 06.08.2026 war das die Typfarbe der Shell; seit die Flaeche blau ist, ist
    // der gefuellte Knopf gruen, wie in Anmeldung und Einstieg.
    expect(QUELLE).toContain("--primary: var(--type-sm);");
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
