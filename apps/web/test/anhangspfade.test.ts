import { describe, expect, it } from "vitest";
import { normalize } from "@aas-editor/core";
import type { JsonObject } from "@aas-editor/core";

import { freierPfad, vorschlagsPfad, zielPfad } from "@/lib/anhangspfade";

/**
 * Wohin eine neu gewaehlte Datei geht.
 *
 * Gemeldet am 10.08.2026: "Ersetzen" an einem File-Element aenderte auch das Vorschaubild
 * der Schale, weil beide auf dieselbe Datei im Paket zeigten.
 */

/** Ein Modell, in dem ProductImage0 und das Vorschaubild denselben Pfad tragen koennen. */
function modell(thumbnailPfad: string | null, dateiPfad = "/aasx/suppl/image.png"): JsonObject {
  const assetInformation: JsonObject = {
    assetKind: "Instance",
    globalAssetId: "urn:test:asset:1",
  };
  if (thumbnailPfad !== null) {
    assetInformation["defaultThumbnail"] = { path: thumbnailPfad, contentType: "image/png" };
  }
  return {
    assetAdministrationShells: [
      {
        modelType: "AssetAdministrationShell",
        id: "urn:test:aas:1",
        idShort: "Base",
        assetInformation,
      },
    ],
    submodels: [
      {
        modelType: "Submodel",
        id: "urn:test:sm:technik",
        idShort: "TechnicalData",
        submodelElements: [
          {
            modelType: "File",
            idShort: "ProductImage0",
            contentType: "image/png",
            value: dateiPfad,
          },
        ],
      },
    ],
  };
}

const belegtMit =
  (...pfade: string[]) =>
  (kandidat: string) =>
    pfade.includes(kandidat);

describe("vorschlagsPfad", () => {
  it("legt unter /aasx/suppl ab und entschaerft den Dateinamen", () => {
    expect(vorschlagsPfad("Datenblatt (DE).pdf")).toBe("/aasx/suppl/Datenblatt-DE-.pdf");
  });

  it("faellt auf einen Namen zurueck, wenn nichts uebrig bleibt", () => {
    expect(vorschlagsPfad("äöü")).toBe("/aasx/suppl/anhang");
  });
});

describe("freierPfad", () => {
  it("nimmt den Vorschlag, wenn dort nichts liegt", () => {
    expect(freierPfad("bild.png", belegtMit())).toBe("/aasx/suppl/bild.png");
  });

  it("zaehlt vor der Endung, nicht dahinter", () => {
    expect(freierPfad("bild.png", belegtMit("/aasx/suppl/bild.png"))).toBe(
      "/aasx/suppl/bild-2.png",
    );
  });

  it("zaehlt weiter, bis wirklich etwas frei ist", () => {
    const belegt = belegtMit("/aasx/suppl/bild.png", "/aasx/suppl/bild-2.png");
    expect(freierPfad("bild.png", belegt)).toBe("/aasx/suppl/bild-3.png");
  });

  it("kommt mit einem Namen ohne Endung aus", () => {
    expect(freierPfad("modell", belegtMit("/aasx/suppl/modell"))).toBe("/aasx/suppl/modell-2");
  });
});

describe("zielPfad", () => {
  it("ersetzt an Ort und Stelle, wenn nur ein Element auf die Datei zeigt", () => {
    const ergebnis = zielPfad(
      "/aasx/suppl/image.png",
      "neu.png",
      normalize(modell("/aasx/suppl/vorschau.png")),
      belegtMit("/aasx/suppl/image.png"),
    );
    expect(ergebnis).toEqual({ ziel: "/aasx/suppl/image.png", abgezweigt: false });
  });

  it("zweigt ab, wenn Vorschaubild und File-Element dieselbe Datei teilen", () => {
    // Genau die Lage aus VNDP77EV202504291.aasx.
    const ergebnis = zielPfad(
      "/aasx/suppl/image.png",
      "neu.png",
      normalize(modell("/aasx/suppl/image.png")),
      belegtMit("/aasx/suppl/image.png"),
    );
    expect(ergebnis).toEqual({ ziel: "/aasx/suppl/neu.png", abgezweigt: true });
  });

  it("weicht beim Abzweigen einem belegten Pfad aus", () => {
    const ergebnis = zielPfad(
      "/aasx/suppl/image.png",
      "neu.png",
      normalize(modell("/aasx/suppl/image.png")),
      belegtMit("/aasx/suppl/image.png", "/aasx/suppl/neu.png"),
    );
    expect(ergebnis).toEqual({ ziel: "/aasx/suppl/neu-2.png", abgezweigt: true });
  });

  it("bildet den Pfad aus dem Dateinamen, wenn das Element noch keinen traegt", () => {
    const ergebnis = zielPfad("", "neu.png", normalize(modell(null)), belegtMit());
    expect(ergebnis).toEqual({ ziel: "/aasx/suppl/neu.png", abgezweigt: false });
  });

  it("ueberschreibt dabei keinen fremden Anhang mit gleichem Namen", () => {
    // Zwei Elemente, zweimal dieselbe Datei gewaehlt: das zweite bekommt einen eigenen Pfad.
    const ergebnis = zielPfad("", "bild.png", normalize(modell(null)), (kandidat) =>
      kandidat === "/aasx/suppl/bild.png",
    );
    expect(ergebnis.ziel).toBe("/aasx/suppl/bild-2.png");
  });

  it("ersetzt an Ort und Stelle, solange kein Modell dasteht", () => {
    expect(zielPfad("aasx/suppl/image.png", "neu.png", null, belegtMit())).toEqual({
      ziel: "/aasx/suppl/image.png",
      abgezweigt: false,
    });
  });
});
