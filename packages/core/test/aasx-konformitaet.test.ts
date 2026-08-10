import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { exportAasx, exportFile, importFile } from "../src/io/index.js";
import { normalize } from "../src/model/normalize.js";
import { toAasCore } from "../src/model/aasCore.js";
import type { Attachment, AttachmentMap } from "../src/io/types.js";
import type { JsonObject } from "../src/model/json.js";

/**
 * Konformitaet des AASX-Containers gegen IDTA-01005-3-2 (Part 5, Package File Format).
 *
 * **Warum dieser Test ueberhaupt.** Das Paket schreibt nicht der Editor, sondern
 * `aas-package3-typescript`. Die Konformitaet haengt damit an einer fremden Bibliothek,
 * und ein Update koennte sie still brechen: aufgefallen waere es erst beim Partner, der
 * das Paket nicht mehr oeffnen kann. Geprueft wird deshalb bewusst an den **ausgepackten
 * Bytes** und nicht ueber die API der Bibliothek. Ein Test, der die Bibliothek befragt,
 * ob sie getan hat, was sie fuer richtig haelt, prueft nichts.
 *
 * Geprueft wird ausschliesslich Normatives (MUST/SHALL) plus die eine Namenskonvention,
 * fuer die sich das Projekt bewusst entschieden hat.
 */

const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const REL_AAS = "http://admin-shell.io/aasx/relationships";

/** Ein Environment mit einer Schale, einem Teilmodell und einem File-Element. */
const ENVIRONMENT: JsonObject = {
  assetAdministrationShells: [
    {
      modelType: "AssetAdministrationShell",
      id: "urn:test:aas:1",
      idShort: "Geraet",
      assetInformation: {
        assetKind: "Instance",
        globalAssetId: "urn:test:asset:1",
        defaultThumbnail: { path: "/aasx/suppl/vorschau.png", contentType: "image/png" },
      },
    },
  ],
  submodels: [
    {
      modelType: "Submodel",
      id: "urn:test:sm:doku",
      idShort: "Doku",
      submodelElements: [
        {
          modelType: "File",
          idShort: "Datenblatt",
          contentType: "application/pdf",
          value: "/aasx/suppl/datenblatt.pdf",
        },
      ],
    },
  ],
};

function anhang(path: string, contentType: string, text: string): Attachment {
  return { path, contentType, bytes: new TextEncoder().encode(text) };
}

const ANHAENGE: AttachmentMap = new Map([
  ["/aasx/suppl/datenblatt.pdf", anhang("/aasx/suppl/datenblatt.pdf", "application/pdf", "%PDF-1.4")],
  ["/aasx/suppl/vorschau.png", anhang("/aasx/suppl/vorschau.png", "image/png", "PNG")],
]);

const THUMBNAIL = anhang("/thumbnail.png", "image/png", "PNG");

async function bauePaket(): Promise<Record<string, Uint8Array>> {
  const bytes = await exportAasx(toAasCore(normalize(ENVIRONMENT)), {
    attachments: ANHAENGE,
    thumbnail: THUMBNAIL,
  });
  return unzipSync(bytes);
}

/** Die Beziehungen einer .rels-Datei als Paare aus Typ und Ziel. */
function beziehungen(inhalt: string): { typ: string; ziel: string }[] {
  const treffer = [...inhalt.matchAll(/<Relationship\b[^>]*\/?>/g)];
  return treffer.map((eintrag) => ({
    typ: /Type="([^"]+)"/.exec(eintrag[0])?.[1] ?? "",
    ziel: /Target="([^"]+)"/.exec(eintrag[0])?.[1] ?? "",
  }));
}

/** Vergleicht Ziele unabhaengig davon, ob sie mit fuehrendem Schraegstrich stehen. */
function zeigtAuf(ziel: string, pfad: string): boolean {
  return ziel.replace(/^\//, "") === pfad.replace(/^\//, "");
}

describe("AASX-Konformitaet nach IDTA-01005-3-2", () => {
  it("bringt die von den Open Packaging Conventions verlangten Teile mit", async () => {
    const teile = await bauePaket();
    expect(Object.keys(teile)).toContain("[Content_Types].xml");
    expect(Object.keys(teile)).toContain("_rels/.rels");
    expect(Object.keys(teile)).toContain("aasx/aasx-origin");
  });

  /*
   * "The source of the aasx origin relationship must be the package root." Die Quelle
   * einer Beziehung ist der Ort ihrer .rels-Datei; fuer die Wurzel ist das `_rels/.rels`.
   * Stuende sie woanders, faende ein Leser den Einstiegspunkt nicht.
   */
  it("verankert die aasx-origin-Beziehung in der Paketwurzel", async () => {
    const teile = await bauePaket();
    const wurzel = beziehungen(strFromU8(teile["_rels/.rels"] as Uint8Array));
    const origin = wurzel.find((b) => b.typ === `${REL_AAS}/aasx-origin`);
    expect(origin, "keine aasx-origin-Beziehung in _rels/.rels").toBeDefined();
    expect(zeigtAuf(origin?.ziel ?? "", "aasx/aasx-origin")).toBe(true);
  });

  it("legt die Origin-Datei leer oder mit „Intentionally empty“ an", async () => {
    const teile = await bauePaket();
    const inhalt = strFromU8(teile["aasx/aasx-origin"] as Uint8Array).trim();
    expect(inhalt === "" || /^Intentionally empty\.?$/i.test(inhalt)).toBe(true);
  });

  it("verankert die aas-spec-Beziehung in der Origin-Datei", async () => {
    const teile = await bauePaket();
    const rels = teile["aasx/_rels/aasx-origin.rels"] as Uint8Array | undefined;
    expect(rels, "aasx/_rels/aasx-origin.rels fehlt").toBeDefined();
    const spec = beziehungen(strFromU8(rels as Uint8Array)).filter(
      (b) => b.typ === `${REL_AAS}/aas-spec`,
    );
    // Kardinalitaet 1..*
    expect(spec.length).toBeGreaterThanOrEqual(1);
    expect(zeigtAuf(spec[0]?.ziel ?? "", "aasx/data.xml")).toBe(true);
  });

  /*
   * "The source of any aasx-suppl relationship must be the file containing the AAS
   * structure/specification." Nicht die Wurzel, nicht die Origin-Datei. Genau hier ist
   * ein Fehler leicht gemacht und von aussen nicht zu sehen.
   */
  it("verankert jede aas-suppl-Beziehung in der Spec-Datei", async () => {
    const teile = await bauePaket();
    const rels = teile["aasx/_rels/data.xml.rels"] as Uint8Array | undefined;
    expect(rels, "aasx/_rels/data.xml.rels fehlt").toBeDefined();
    const suppl = beziehungen(strFromU8(rels as Uint8Array)).filter(
      (b) => b.typ === `${REL_AAS}/aas-suppl`,
    );
    const ziele = suppl.map((b) => b.ziel.replace(/^\//, "")).sort();
    expect(ziele).toEqual(["aasx/suppl/datenblatt.pdf", "aasx/suppl/vorschau.png"]);
  });

  it("verankert die Thumbnail-Beziehung in der Wurzel, mit dem OPC-Typ", async () => {
    const teile = await bauePaket();
    const wurzel = beziehungen(strFromU8(teile["_rels/.rels"] as Uint8Array));
    const thumb = wurzel.find((b) => b.typ === `${REL}/metadata/thumbnail`);
    expect(thumb, "keine Thumbnail-Beziehung in _rels/.rels").toBeDefined();
    expect(zeigtAuf(thumb?.ziel ?? "", "thumbnail.png")).toBe(true);
  });

  /*
   * Die Spezifikation fuehrt `http://www.admin-shell.io/aasx/relationships` ausdruecklich
   * als deprecated. Ein Paket, das die alte Variante schreibt, wird von neuen Lesern nicht
   * mehr gefunden. Deshalb der Blick ueber **alle** Teile, nicht nur ueber die .rels.
   */
  it("verwendet nirgends den veralteten www-Namensraum", async () => {
    const teile = await bauePaket();
    for (const [name, bytes] of Object.entries(teile)) {
      expect(strFromU8(bytes), `veralteter Namensraum in ${name}`).not.toContain(
        "www.admin-shell.io/aasx/relationships",
      );
    }
  });

  it("fuehrt jede vorkommende Endung in den Content Types", async () => {
    const teile = await bauePaket();
    const typen = strFromU8(teile["[Content_Types].xml"] as Uint8Array);
    const endungen = new Set(
      Object.keys(teile)
        .filter((name) => !name.startsWith("_rels/") && !name.includes("/_rels/"))
        .map((name) => name.split(".").pop() ?? "")
        .filter((endung) => endung !== "" && !endung.includes("/")),
    );
    for (const endung of endungen) {
      if (endung === "[Content_Types].xml") continue;
      const gefuehrt =
        new RegExp(`Extension="${endung}"`, "i").test(typen) ||
        new RegExp(`PartName="[^"]*\\.${endung}"`, "i").test(typen);
      expect(gefuehrt, `Endung .${endung} fehlt in [Content_Types].xml`).toBe(true);
    }
  });

  it("meldet den bei der IANA registrierten MIME-Typ", async () => {
    const ergebnis = await exportFile({ model: normalize(ENVIRONMENT), format: "aasx" });
    expect(ergebnis.contentType).toBe("application/aas+zip");
    expect(ergebnis.fileName.endsWith(".aasx")).toBe(true);
  });

  it("liest das eigene Paket vollstaendig wieder ein", async () => {
    const bytes = await exportAasx(toAasCore(normalize(ENVIRONMENT)), {
      attachments: ANHAENGE,
      thumbnail: THUMBNAIL,
    });
    const gelesen = await importFile(bytes, "test.aasx");
    expect(gelesen.format).toBe("aasx");
    expect([...gelesen.attachments.keys()].sort()).toEqual([
      "/aasx/suppl/datenblatt.pdf",
      "/aasx/suppl/vorschau.png",
    ]);
    expect(gelesen.thumbnail?.path).toBe("/thumbnail.png");
    // Und kein File-Element haengt in der Luft: die Warnung ueber fehlende Anhaenge
    // bleibt aus, wenn die Pfade im Paket wirklich ankommen.
    expect(gelesen.warnings.filter((w) => w.kind === "fehlender-anhang")).toEqual([]);
  });
});
