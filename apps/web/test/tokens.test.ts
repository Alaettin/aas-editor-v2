import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Wachen ueber die Farbordnung.
 *
 * Bis zum 06.08.2026 stand hier der Abgleich zweier Rampen, bis zum 08.08.2026 der
 * Abgleich der Rampe mit der Markenflaeche `.szene-axon`. Beides ist weg: es gibt genau
 * eine Rampe, und Anmeldung, Einstieg und Editor stehen darauf. Was bleibt, ist die Wache
 * gegen den Rueckfall: keine zweite Erscheinung, keine zweite Markenflaeche, keine
 * Farbwerte im Programmcode.
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

  it("fuehrt keine zweite Markenflaeche mehr", () => {
    // `.szene-axon` war die eigene Flaeche von Anmeldung und Einstieg, mit eigenem Blau,
    // eigenen Schriftfarben und eigenen Knopfformen. Kommt sie zurueck, stehen die
    // Markenfarben wieder an zwei Orten, und beim Arbeiten an einer faellt es nie auf.
    expect(QUELLE).not.toMatch(/\.szene-axon\s*\{/);
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
