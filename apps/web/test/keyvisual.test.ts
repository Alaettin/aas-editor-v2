import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ansichtFuer,
  baueSchienen,
  baueStroeme,
  CY,
  HOEHE,
  huellkurve,
  MAX_STROEME,
  MIN_BREITE,
  MIN_STROEME,
  schienenPunkt,
  stromPunkt,
  stromY,
  waehleZufaellig,
  WELLE_MAX,
  type Buehne,
} from "../src/components/Keyvisual/geometry";

/**
 * Das Keyvisual erzaehlt eine Aussage: links laeuft es chaotisch und eigen, im Knoten
 * kommt alles zusammen, rechts geht es geordnet weiter. Diese Tests halten genau das fest,
 * nicht die Optik.
 */

const ZEITEN = [0, 0.7, 3.3, 12.5];
const BUEHNE: Buehne = ansichtFuer(1600, 900).buehne;

describe("Ansicht", () => {
  it("fuellt bei ueblichen Fenstern die Hoehe", () => {
    const ansicht = ansichtFuer(1600, 900);
    expect(ansicht.skala).toBeCloseTo(1, 5);
    expect(ansicht.versatzY).toBeCloseTo(0, 5);
    expect(ansicht.buehne.breite).toBeCloseTo(1600, 5);
  });

  it("weicht auf die Breite aus, bevor die Komposition zerfaellt", () => {
    // Sehr hohes Fenster: nach Hoehe skaliert waere die Szene schmaler als MIN_BREITE.
    const ansicht = ansichtFuer(1000, 1400);
    expect(ansicht.buehne.breite).toBeCloseTo(MIN_BREITE, 5);
    // Die Szene wird dadurch kleiner als das Fenster und sitzt mittig. Oben und unten
    // bleibt Grundfarbe stehen, das faellt nicht auf, ein zerdruecktes Bild schon.
    expect(ansicht.versatzY).toBeGreaterThan(0);
  });

  it("setzt den Knoten immer auf 37,5 Prozent der Breite", () => {
    for (const [w, h] of [
      [1440, 900],
      [2560, 1080],
      [1280, 1024],
    ]) {
      const { buehne } = ansichtFuer(w!, h!);
      expect(buehne.knotenX / buehne.breite).toBeCloseTo(0.375, 6);
      expect(buehne.startX).toBeLessThan(0);
    }
  });

  it("bleibt bei entarteten Groessen rechenbar", () => {
    const ansicht = ansichtFuer(0, 0);
    expect(Number.isFinite(ansicht.skala)).toBe(true);
    expect(ansicht.skala).toBeGreaterThan(0);
  });
});

describe("Schienen", () => {
  const schienen = baueSchienen();

  it("sind acht und liegen paarweise symmetrisch zur Mittellinie", () => {
    expect(schienen).toHaveLength(8);
    expect(schienen.reduce((s, r) => s + (r.y - CY), 0)).toBe(0);

    for (const schiene of schienen) {
      const spiegel = schienen.find((r) => r.y === 2 * CY - schiene.y);
      expect(spiegel).toBeDefined();
      expect(spiegel?.rang).toBe(schiene.rang);
      expect(spiegel?.ton).toBe(schiene.ton);
    }
  });

  it("liegen von oben nach unten sortiert", () => {
    for (let i = 1; i < schienen.length; i += 1) {
      expect(schienen[i]!.y).toBeGreaterThan(schienen[i - 1]!.y);
    }
  });

  it("beginnen exakt am Knoten und enden ausserhalb des Bildes", () => {
    for (const schiene of schienen) {
      for (const zeit of ZEITEN) {
        expect(schienenPunkt(schiene, 0, zeit, BUEHNE)).toEqual({ x: BUEHNE.knotenX, y: CY });

        const ende = schienenPunkt(schiene, 1, zeit, BUEHNE);
        expect(ende.x).toBeGreaterThanOrEqual(BUEHNE.breite);
        // Am Ende traegt die Schiene ihre Welle, aber sie bleibt auf ihrer Spur.
        expect(Math.abs(ende.y - schiene.y)).toBeLessThanOrEqual(WELLE_MAX);
      }
    }
  });

  it("laufen streng nach rechts und knicken nicht zurueck", () => {
    for (const schiene of schienen) {
      let vorher = -Infinity;
      for (let i = 0; i <= 200; i += 1) {
        const punkt = schienenPunkt(schiene, i / 200, 2.5, BUEHNE);
        expect(punkt.x).toBeGreaterThan(vorher);
        vorher = punkt.x;
      }
    }
  });

  it("bleiben bis zum Abzweig exakt auf der Mittellinie", () => {
    // Vor dem Abzweig ist die Rampe der Welle null. Das Bild soll dort ein Strang sein.
    for (const schiene of schienen) {
      const abzweig = BUEHNE.knotenX + 60 + schiene.rang * 34;
      for (const zeit of ZEITEN) {
        for (let i = 0; i <= 60; i += 1) {
          const punkt = schienenPunkt(schiene, i / 60, zeit, BUEHNE);
          if (punkt.x < abzweig) expect(punkt.y).toBe(CY);
        }
      }
    }
  });

  it("halten die Welle in Grenzen und ueberschreiten die eigene Spur nicht dauerhaft", () => {
    for (const schiene of schienen) {
      const richtung = Math.sign(schiene.y - CY);
      for (const zeit of ZEITEN) {
        for (let i = 0; i <= 200; i += 1) {
          const punkt = schienenPunkt(schiene, i / 200, zeit, BUEHNE);
          const abstand = (punkt.y - CY) * richtung;
          expect(abstand).toBeGreaterThanOrEqual(-WELLE_MAX);
          expect(abstand).toBeLessThanOrEqual(Math.abs(schiene.y - CY) + WELLE_MAX);
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
        expect(stromY(strom, 1, zeit)).toBe(CY);
        expect(stromPunkt(strom, 1, zeit, BUEHNE)).toEqual({ x: BUEHNE.knotenX, y: CY });
      }
    }
  });

  it("sind links wirklich ungeordnet", () => {
    const stroeme = baueStroeme(15);
    for (const zeit of ZEITEN) {
      const groesste = Math.max(...stroeme.map((s) => Math.abs(stromY(s, 0, zeit) - CY)));
      expect(groesste).toBeGreaterThan(100);
    }
  });

  it("liefern nie NaN", () => {
    for (const strom of baueStroeme(28)) {
      for (const zeit of ZEITEN) {
        for (let i = 0; i <= 40; i += 1) {
          expect(Number.isFinite(stromY(strom, i / 40, zeit))).toBe(true);
          expect(Number.isFinite(stromPunkt(strom, i / 40, zeit, BUEHNE).y)).toBe(true);
        }
      }
    }
  });

  it("beginnen links ausserhalb des Bildes", () => {
    const strom = baueStroeme(15)[0]!;
    expect(stromPunkt(strom, 0, 1, BUEHNE).x).toBe(BUEHNE.startX);
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
        // Verboten sind feste Werte. `rgb(${tripel} / ...)` ist erlaubt: das ist genau der
        // Weg, auf dem ein Kanaltripel aus den Tokens eine Deckkraft bekommt.
        if (/#[0-9a-fA-F]{3,8}\b/.test(zeile) || /\brgba?\(\s*[\d.]/.test(zeile)) {
          treffer.push(`${name}: ${zeile.trim()}`);
        }
      }
    }

    expect(treffer).toEqual([]);
  });

  it("kennt die Entwurfshoehe an genau einer Stelle", () => {
    expect(HOEHE).toBe(900);
  });
});
