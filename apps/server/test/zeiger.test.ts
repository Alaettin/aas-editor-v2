import { describe, expect, it } from "vitest";
import { lies, segmente, wendeAn, ZeigerFehler } from "../src/mcp/zeiger.js";

/**
 * JSON Pointer nach RFC 6901.
 *
 * Die Fassung im Standard ist kurz, ihre Fallen sind es nicht: `~0` und `~1` in der
 * falschen Reihenfolge aufgeloest ergibt stillschweigend etwas anderes, `-` ist nur beim
 * Anfuegen ein Segment, und fuehrende Nullen sind kein gueltiger Index.
 */

const ENV = {
  submodels: [
    {
      idShort: "Typenschild",
      submodelElements: [
        { idShort: "A", value: "1" },
        { idShort: "B", value: "2" },
      ],
    },
  ],
};

describe("segmente", () => {
  it("liest den leeren Zeiger als das Ganze", () => {
    expect(segmente("")).toEqual([]);
  });

  it("loest ~1 vor ~0 auf", () => {
    // Andersherum wuerde aus `~01` erst `~1` und daraus faelschlich `/`.
    expect(segmente("/a~01b")).toEqual(["a~1b"]);
    expect(segmente("/a~1b")).toEqual(["a/b"]);
    expect(segmente("/a~0b")).toEqual(["a~b"]);
  });

  it("verlangt den fuehrenden Schraegstrich", () => {
    expect(() => segmente("submodels/0")).toThrow(ZeigerFehler);
  });
});

describe("lies", () => {
  it("folgt Objekten und Listen", () => {
    expect(lies(ENV, "/submodels/0/submodelElements/1/value")).toBe("2");
  });

  it("gibt undefined, wo nichts steht", () => {
    expect(lies(ENV, "/submodels/9")).toBeUndefined();
    expect(lies(ENV, "/gibtsnicht")).toBeUndefined();
  });

  it("nimmt eine fuehrende Null nicht als Index", () => {
    expect(lies(ENV, "/submodels/00")).toBeUndefined();
  });
});

describe("wendeAn", () => {
  it("laesst die Vorlage unberuehrt", () => {
    const kopie = JSON.stringify(ENV);
    wendeAn(ENV, [{ op: "setzen", pfad: "/submodels/0/idShort", wert: "Anders" }]);
    expect(JSON.stringify(ENV)).toBe(kopie);
  });

  it("setzt, entfernt und fuegt an", () => {
    const gesetzt = wendeAn(ENV, [
      { op: "setzen", pfad: "/submodels/0/submodelElements/0/value", wert: "neu" },
    ]);
    expect(lies(gesetzt, "/submodels/0/submodelElements/0/value")).toBe("neu");

    const entfernt = wendeAn(ENV, [{ op: "entfernen", pfad: "/submodels/0/submodelElements/0" }]);
    expect(lies(entfernt, "/submodels/0/submodelElements/0/idShort")).toBe("B");

    const angehaengt = wendeAn(ENV, [
      { op: "anfuegen", pfad: "/submodels/0/submodelElements/-", wert: { idShort: "C" } },
    ]);
    expect(lies(angehaengt, "/submodels/0/submodelElements/2/idShort")).toBe("C");
  });

  it("fuegt an einem Index mitten in die Liste ein", () => {
    const ergebnis = wendeAn(ENV, [
      { op: "anfuegen", pfad: "/submodels/0/submodelElements/0", wert: { idShort: "Neu" } },
    ]);
    expect(lies(ergebnis, "/submodels/0/submodelElements/0/idShort")).toBe("Neu");
    expect(lies(ergebnis, "/submodels/0/submodelElements/1/idShort")).toBe("A");
  });

  it("legt ein neues Feld an einem Objekt an", () => {
    const ergebnis = wendeAn(ENV, [
      { op: "anfuegen", pfad: "/conceptDescriptions", wert: [{ idShort: "CD" }] },
    ]);
    expect(Array.isArray(lies(ergebnis, "/conceptDescriptions"))).toBe(true);
  });

  it("weigert sich, ein vorhandenes Feld anzufuegen", () => {
    // Sonst waere anfuegen dasselbe wie setzen, und niemand merkt sich, wann was gilt.
    expect(() => wendeAn(ENV, [{ op: "anfuegen", pfad: "/submodels", wert: [] }])).toThrow(
      /gibt es schon/,
    );
  });

  it("nennt bei einem Fehler die Nummer des Patches", () => {
    expect(() =>
      wendeAn(ENV, [
        { op: "setzen", pfad: "/submodels/0/idShort", wert: "ok" },
        { op: "entfernen", pfad: "/submodels/0/gibtsnicht" },
      ]),
    ).toThrow(/Patch 2 von 2/);
  });

  it("verlangt einen Wert, wo einer hingehoert", () => {
    expect(() => wendeAn(ENV, [{ op: "setzen", pfad: "/a" }])).toThrow(/fehlt wert/);
  });

  it("laesst das Ganze nicht ersetzen", () => {
    expect(() => wendeAn(ENV, [{ op: "setzen", pfad: "", wert: {} }])).toThrow(/das Ganze/);
  });

  it("sagt, an welcher Stelle ein Pfad ins Leere fuehrt", () => {
    expect(() => wendeAn(ENV, [{ op: "setzen", pfad: "/submodels/5/idShort", wert: "x" }])).toThrow(
      /submodels\/5/,
    );
  });

  it("nimmt \"-\" nur beim Anfuegen", () => {
    expect(() =>
      wendeAn(ENV, [{ op: "setzen", pfad: "/submodels/0/submodelElements/-", wert: {} }]),
    ).toThrow(/kein gueltiger Index/);
  });
});
