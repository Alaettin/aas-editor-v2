import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  baueSchienen,
  baueStroeme,
  huellkurve,
  MAX_STROEME,
  MIN_STROEME,
  schienenPunkt,
  stromPunkt,
  stromY,
  SZENE,
  waehleZufaellig,
} from "../src/components/Keyvisual/geometry";

/**
 * Das Keyvisual erzaehlt eine Aussage: links laeuft es chaotisch und eigen, im Knoten
 * kommt alles zusammen, rechts geht es geordnet weiter. Diese Tests halten genau das fest,
 * nicht die Optik.
 */

const ZEITEN = [0, 0.7, 3.3, 12.5];

describe("Schienen", () => {
  const schienen = baueSchienen();

  it("sind zehn und liegen paarweise symmetrisch zur Mittellinie", () => {
    expect(schienen).toHaveLength(10);

    const summe = schienen.reduce((s, r) => s + (r.y - SZENE.CY), 0);
    expect(summe).toBe(0);

    for (const schiene of schienen) {
      const spiegel = schienen.find((r) => r.y === 2 * SZENE.CY - schiene.y);
      expect(spiegel).toBeDefined();
      expect(spiegel?.split).toBe(schiene.split);
      expect(spiegel?.run).toBe(schiene.run);
      expect(spiegel?.ton).toBe(schiene.ton);
    }
  });

  it("beginnen exakt am Knoten und enden ausserhalb des Bildes", () => {
    for (const schiene of schienen) {
      expect(schienenPunkt(schiene, 0)).toEqual({ x: SZENE.NODE, y: SZENE.CY });

      const ende = schienenPunkt(schiene, 1);
      expect(ende.x).toBeGreaterThanOrEqual(SZENE.W);
      expect(ende.y).toBe(schiene.y);
    }
  });

  it("laufen streng nach rechts und knicken nicht zurueck", () => {
    for (const schiene of schienen) {
      let vorher = -Infinity;
      for (let i = 0; i <= 200; i += 1) {
        const punkt = schienenPunkt(schiene, i / 200);
        expect(punkt.x).toBeGreaterThan(vorher);
        vorher = punkt.x;
      }
    }
  });

  it("bleiben vor dem Abzweig auf der Mittellinie und danach auf ihrer Hoehe", () => {
    for (const schiene of schienen) {
      const richtung = Math.sign(schiene.y - SZENE.CY);
      for (let i = 0; i <= 200; i += 1) {
        const punkt = schienenPunkt(schiene, i / 200);
        if (punkt.x < schiene.split) expect(punkt.y).toBe(SZENE.CY);
        else if (punkt.x > schiene.split + schiene.run) expect(punkt.y).toBe(schiene.y);
        else {
          // Im Bogen: monoton zwischen Mittellinie und Zielhoehe, kein Ueberschwingen.
          const abstand = (punkt.y - SZENE.CY) * richtung;
          expect(abstand).toBeGreaterThanOrEqual(0);
          expect(abstand).toBeLessThanOrEqual(Math.abs(schiene.y - SZENE.CY));
        }
      }
    }
  });
});

describe("Stroeme", () => {
  it("klemmen die Anzahl und bleiben deterministisch", () => {
    expect(baueStroeme(2)).toHaveLength(MIN_STROEME);
    expect(baueStroeme(99)).toHaveLength(MAX_STROEME);
    expect(baueStroeme(15)).toHaveLength(15);
    expect(baueStroeme(15)).toEqual(baueStroeme(15));
  });

  it("legen die beiden Leitfarben zuoberst", () => {
    const stroeme = baueStroeme(15);

    for (let i = 1; i < stroeme.length; i += 1) {
      expect(stroeme[i]!.z).toBeGreaterThanOrEqual(stroeme[i - 1]!.z);
    }

    expect(stroeme.filter((s) => s.kanal === "cyan")).toHaveLength(1);
    expect(stroeme.filter((s) => s.kanal === "orange")).toHaveLength(1);
    expect(stroeme.at(-1)?.kanal).toBe("cyan");
    expect(stroeme.at(-2)?.kanal).toBe("orange");
  });

  it("laufen im Knoten exakt auf der Mittellinie zusammen", () => {
    // Die Kernaussage des Bildes. Faellt dieser Test, ist die Huellkurve zerbrochen.
    for (const strom of baueStroeme(15)) {
      for (const zeit of ZEITEN) {
        expect(stromY(strom, 1, zeit)).toBe(SZENE.CY);
        expect(stromPunkt(strom, 1, zeit)).toEqual({ x: SZENE.NODE, y: SZENE.CY });
      }
    }
  });

  it("sind links wirklich ungeordnet", () => {
    const stroeme = baueStroeme(15);
    for (const zeit of ZEITEN) {
      const groesste = Math.max(...stroeme.map((s) => Math.abs(stromY(s, 0, zeit) - SZENE.CY)));
      expect(groesste).toBeGreaterThan(100);
    }
  });

  it("liefern nie NaN", () => {
    for (const strom of baueStroeme(28)) {
      for (const zeit of ZEITEN) {
        for (let i = 0; i <= 40; i += 1) {
          expect(Number.isFinite(stromY(strom, i / 40, zeit))).toBe(true);
        }
      }
    }
  });

  it("beginnen links ausserhalb des Bildes", () => {
    const strom = baueStroeme(15)[0]!;
    expect(stromPunkt(strom, 0, 1).x).toBe(-SZENE.EINLAUF);
  });
});

describe("Huellkurve", () => {
  it("faellt von eins auf null", () => {
    expect(huellkurve(0)).toBe(1);
    expect(huellkurve(1)).toBe(0);

    let vorher = Infinity;
    for (let i = 0; i <= 100; i += 1) {
      const wert = huellkurve(i / 100);
      expect(wert).toBeLessThan(vorher);
      vorher = wert;
    }
  });
});

describe("waehleZufaellig", () => {
  it("bleibt im Feld, auch an den Raendern", () => {
    const werte = ["a", "b", "c"];
    expect(waehleZufaellig(werte, 0)).toBe("a");
    expect(waehleZufaellig(werte, 0.999)).toBe("c");
    expect(waehleZufaellig(werte, 1)).toBe("c");
    expect(waehleZufaellig([], 0.5)).toBeUndefined();
  });
});

describe("Hausregel", () => {
  it("haelt Einzelwerte aus dem Keyvisual heraus", () => {
    // Farben kommen aus den Tokens, nicht aus dem Code. Mechanisch statt nur schriftlich.
    const ordner = fileURLToPath(new URL("../src/components/Keyvisual", import.meta.url));
    const treffer: string[] = [];

    for (const name of readdirSync(ordner)) {
      if (!/\.tsx?$/.test(name)) continue;
      const inhalt = readFileSync(join(ordner, name), "utf8");
      for (const zeile of inhalt.split(/\r?\n/)) {
        if (zeile.trimStart().startsWith("*") || zeile.trimStart().startsWith("//")) continue;
        if (/#[0-9a-fA-F]{3,8}\b/.test(zeile) || /\brgba?\(/.test(zeile)) {
          treffer.push(`${name}: ${zeile.trim()}`);
        }
      }
    }

    expect(treffer).toEqual([]);
  });
});
