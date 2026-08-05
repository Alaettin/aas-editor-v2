import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  applyChange,
  countNodes,
  denormalize,
  emptyHistory,
  getNode,
  HISTORY_MAX,
  normalize,
  walk,
  type EditorModel,
  type JsonObject,
  type NodeId,
} from "@aas-editor/core";
import { toAasCore } from "@aas-editor/core/aas-core";
import { validate } from "@aas-editor/core/validation";
import { describe, expect, it } from "vitest";

import { buildCensus } from "@/store/census";
import { buildIssueCounts } from "@/store/issueCounts";
import { buildRows } from "@/store/rows";

/**
 * Die Zahlen aus Plan Abschnitt 10, gemessen statt behauptet.
 *
 * Grundlage ist das Modell aus `pnpm modell` (rund zehntausend Elemente). Fehlt es,
 * ueberspringt sich die Datei, wie es `hasTestData()` fuer die Konformitaetsdaten schon
 * vormacht: ein fehlender Datensatz darf keinen roten Lauf erzeugen, eine Verschlechterung
 * dagegen schon.
 *
 * Die Grenzen sind grosszuegig gesetzt. Sie sollen nicht die Tagesform der Maschine
 * bewerten, sondern eine Rueckentwicklung um Groessenordnungen auffangen: genau das
 * passiert, wenn wieder jemand einen Lauf ueber alle Knoten in den Tippweg legt.
 *
 * Die gemessenen Werte stehen in `docs/leistung.md`.
 */

const DATEI = fileURLToPath(new URL("../../../test-data/gross/modell-10000.json", import.meta.url));
const vorhanden = existsSync(DATEI);

/** Median aus mehreren Laeufen. Robuster als der Mittelwert, wenn der Sammler dazwischenfunkt. */
function miss(name: string, laeufe: number, arbeit: () => void): number {
  const zeiten: number[] = [];
  for (let i = 0; i < laeufe; i += 1) {
    const start = performance.now();
    arbeit();
    zeiten.push(performance.now() - start);
  }
  zeiten.sort((a, b) => a - b);
  const median = zeiten[Math.floor(zeiten.length / 2)] ?? 0;
  console.log(`  ${name.padEnd(28)} ${median.toFixed(1).padStart(8)} ms`);
  return median;
}

/** Alle Knoten aufgeklappt: der teuerste Fall fuer den Baum. */
function allesAufgeklappt(model: EditorModel): Record<NodeId, true> {
  const out: Record<NodeId, true> = {};
  for (const node of walk(model)) out[node.nodeId] = true;
  return out;
}

/** Irgendein Blatt mit idShort, an dem sich eine Aenderung nachstellen laesst. */
function einBlatt(model: EditorModel): NodeId {
  for (const node of walk(model)) {
    if (node.kind === "Property") return node.nodeId;
  }
  throw new Error("Das Testmodell hat keine Property.");
}

describe.skipIf(!vorhanden)("Leistung bei zehntausend Elementen", () => {
  const environment = JSON.parse(readFileSync(DATEI, "utf8")) as JsonObject;
  const model = normalize(environment);
  const expanded = allesAufgeklappt(model);
  const blatt = einBlatt(model);

  it("liest ein Modell der erwarteten Groesse", () => {
    expect(countNodes(model)).toBeGreaterThan(9000);
    expect(countNodes(model)).toBeLessThan(12000);
  });

  it("ist metamodellkonform, sonst misst man Unsinn", async () => {
    const befunde = await validate(model);
    expect(befunde.filter((b) => b.severity === "constraint")).toEqual([]);
  });

  it("baut den Baum, den Zensus und die Befundzaehler schnell genug", () => {
    console.log("\n  --- Hauptthread ---");
    const zeilen = miss("buildRows (alles offen)", 5, () => buildRows(model, expanded));
    const zensus = miss("buildCensus", 5, () => buildCensus(model));
    const befunde = miss("buildIssueCounts", 5, () => buildIssueCounts(model, []));

    expect(buildRows(model, expanded).length).toBe(countNodes(model));
    // Alle drei laufen je Modellaenderung. Zusammen muessen sie deutlich unter einem
    // Rahmen bleiben, sonst ruckelt jede Eingabe. Gemessen sind es 7, 3 und 0 ms; die
    // Grenzen liegen bei etwa dem Dreifachen, damit die Tagesform der Maschine keinen
    // roten Lauf erzeugt, eine Rueckentwicklung um eine Groessenordnung aber schon.
    expect(zeilen).toBeLessThan(25);
    expect(zensus).toBeLessThan(12);
    expect(befunde).toBeLessThan(10);
  });

  it("wendet eine einzelne Feldaenderung schnell an", () => {
    const dauer = miss("applyChange (ein Feld)", 20, () => {
      applyChange(model, emptyHistory, "Messung", (draft) => {
        getNode(draft, blatt).data["value"] = "gemessen";
      });
    });
    // Immer kopiert nur die Wirbelsaeule, nicht den Graphen. Alles ueber zehn Millisekunden
    // hiesse, dass doch irgendwo tief kopiert wird.
    expect(dauer).toBeLessThan(10);
  });

  // Zweitausend Aenderungen an einem Modell dieser Groesse brauchen ihre Zeit, das ist der
  // Sinn der Messung. Der Vorgabewert von fuenf Sekunden reicht dafuer nicht.
  it(
    "laesst die Aenderung nicht mit der Laenge der Historie teurer werden",
    { timeout: 60000 },
    () => {
      // Zweitausend Aenderungen hintereinander. Ohne Deckel waechst `past` unbegrenzt, jede
      // weitere Aenderung kopiert ein groesseres Feld, und die letzten sind messbar teurer
      // als die ersten. Genau dieser Vergleich ist die Aussage, nicht die Gesamtzeit: eine
      // einzelne Aenderung kostet bei zehntausend Knoten nun einmal ihre paar Millisekunden.
      let aktuell = model;
      let historie = emptyHistory;
      const zeiten: number[] = [];

      for (let i = 0; i < 2000; i += 1) {
        const start = performance.now();
        const ergebnis = applyChange(aktuell, historie, "Messung", (draft) => {
          getNode(draft, blatt).data["value"] = `wert${String(i)}`;
        });
        zeiten.push(performance.now() - start);
        aktuell = ergebnis.model;
        historie = ergebnis.history;
      }

      const mittel = (werte: readonly number[]) => werte.reduce((a, b) => a + b, 0) / werte.length;
      const erste = mittel(zeiten.slice(0, 200));
      const letzte = mittel(zeiten.slice(-200));
      console.log(
        `  ${"Aenderung, erste 200".padEnd(28)} ${erste.toFixed(2).padStart(8)} ms\n` +
          `  ${"Aenderung, letzte 200".padEnd(28)} ${letzte.toFixed(2).padStart(8)} ms`,
      );

      expect(historie.past.length).toBe(HISTORY_MAX);
      expect(letzte).toBeLessThan(erste * 1.5 + 1);
    },
  );

  it("wandelt in die SDK und validiert im erwarteten Rahmen", async () => {
    console.log("\n  --- Worker ---");
    miss("denormalize", 3, () => denormalize(model));
    miss("toAasCore", 3, () => toAasCore(model));

    // Validierung laeuft im Worker und blockiert die Eingabe nicht. Gemessen wird sie
    // trotzdem: sie bestimmt, wie schnell Befunde erscheinen.
    const start = performance.now();
    await validate(model);
    const dauer = performance.now() - start;
    console.log(`  ${"validate".padEnd(28)} ${dauer.toFixed(1).padStart(8)} ms\n`);
    // Gemessen rund 65 ms. Die Grenze faengt ab, wenn hier jemand einen zweiten
    // vollstaendigen Aufbau der Umgebung einzieht.
    expect(dauer).toBeLessThan(500);
  });
});
