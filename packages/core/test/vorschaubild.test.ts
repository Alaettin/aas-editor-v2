import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";

import { exportFile } from "../src/io/index.js";
import { collectPackageReferences } from "../src/io/attachments.js";
import { normalize } from "../src/model/normalize.js";
import type { Attachment, AttachmentMap } from "../src/io/types.js";
import type { JsonObject } from "../src/model/json.js";

/**
 * Das Vorschaubild des Containers folgt dem Modell.
 *
 * Gemeldet am 10.08.2026: ein ersetztes Produktbild aenderte auch das Vorschaubild, weil
 * beide auf **dieselbe** Datei im Paket zeigten. Beim Aufraeumen fiel der umgekehrte Fall
 * auf: der OPC-Teil in der Paketwurzel wurde nie nachgezogen und ging veraltet in den
 * Export. Geprueft wird deshalb an den ausgepackten Bytes, nicht ueber die API.
 */

const REL = "http://schemas.openxmlformats.org/package/2006/relationships";

function anhang(path: string, contentType: string, text: string): Attachment {
  return { path, contentType, bytes: new TextEncoder().encode(text) };
}

function umgebung(thumbnailPfad: string | null): JsonObject {
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
        idShort: "Geraet",
        assetInformation,
      },
    ],
    submodels: [
      {
        modelType: "Submodel",
        id: "urn:test:sm:technik",
        idShort: "Technik",
        submodelElements: [
          {
            modelType: "File",
            idShort: "ProductImage0",
            contentType: "image/png",
            // Derselbe Pfad wie das Vorschaubild: genau die Lage aus der Meldung.
            value: "/aasx/suppl/image.png",
          },
        ],
      },
    ],
  };
}

const NEU = anhang("/aasx/suppl/image.png", "image/png", "NEUES BILD");
const ANHAENGE: AttachmentMap = new Map([[NEU.path, NEU]]);
const ALT = anhang("/image.png", "image/png", "ALTES BILD");

async function paket(
  modell: JsonObject,
  attachments: AttachmentMap,
  thumbnail: Attachment | null,
): Promise<Record<string, Uint8Array>> {
  const ergebnis = await exportFile({
    model: normalize(modell),
    format: "aasx",
    attachments,
    ...(thumbnail ? { thumbnail } : {}),
  });
  return unzipSync(ergebnis.bytes);
}

/** Das Ziel der OPC-Thumbnail-Beziehung, ohne fuehrenden Schraegstrich. */
function vorschaubildZiel(teile: Record<string, Uint8Array>): string | null {
  const rels = teile["_rels/.rels"];
  if (!rels) return null;
  const treffer = [...strFromU8(rels).matchAll(/<Relationship\b[^>]*\/?>/g)]
    .map((eintrag) => eintrag[0])
    .find((eintrag) => eintrag.includes(`${REL}/metadata/thumbnail`));
  if (!treffer) return null;
  return (/Target="([^"]+)"/.exec(treffer)?.[1] ?? "").replace(/^\//, "");
}

describe("Vorschaubild des Containers", () => {
  it("nimmt die Bytes des Anhangs, auf den defaultThumbnail zeigt", async () => {
    const teile = await paket(umgebung("/aasx/suppl/image.png"), ANHAENGE, ALT);

    const ziel = vorschaubildZiel(teile);
    expect(ziel).toBe("image.png");
    // Der Kern der Sache: neue Bytes, nicht die des mitgebrachten Vorschaubilds.
    expect(strFromU8(teile["image.png"] as Uint8Array)).toBe("NEUES BILD");
    // Und der Anhang liegt weiterhin an seinem Platz, nicht nur in der Wurzel.
    expect(strFromU8(teile["aasx/suppl/image.png"] as Uint8Array)).toBe("NEUES BILD");
  });

  it("laesst das mitgebrachte Vorschaubild stehen, wenn keine Schale eines fuehrt", async () => {
    const teile = await paket(umgebung(null), ANHAENGE, ALT);
    expect(vorschaubildZiel(teile)).toBe("image.png");
    expect(strFromU8(teile["image.png"] as Uint8Array)).toBe("ALTES BILD");
  });

  it("laesst es auch stehen, wenn defaultThumbnail auf nichts im Paket zeigt", async () => {
    const teile = await paket(umgebung("/aasx/suppl/fehlt.png"), ANHAENGE, ALT);
    expect(vorschaubildZiel(teile)).toBe("image.png");
    expect(strFromU8(teile["image.png"] as Uint8Array)).toBe("ALTES BILD");
  });

  it("laesst das Vorschaubild an seinem Platz, auch wenn es anders heisst", async () => {
    // Die MCP-Werkzeuge legen es bewusst unter /thumbnail.png ab. Der Name gehoert dem,
    // der das Paket gebaut hat; nachgezogen werden nur die Bytes.
    const teile = await paket(
      umgebung("/aasx/suppl/image.png"),
      ANHAENGE,
      anhang("/thumbnail.png", "image/png", "ALTES BILD"),
    );
    expect(vorschaubildZiel(teile)).toBe("thumbnail.png");
    expect(strFromU8(teile["thumbnail.png"] as Uint8Array)).toBe("NEUES BILD");
  });

  it("benennt um, wenn die Endung nicht mehr passt", async () => {
    // Ein JPEG unter .png erklaerte ueber [Content_Types].xml alle PNG-Teile zu JPEGs.
    const jpeg = anhang("/aasx/suppl/image.jpg", "image/jpeg", "JPEG");
    const teile = await paket(
      umgebung("/aasx/suppl/image.jpg"),
      new Map([[jpeg.path, jpeg]]),
      anhang("/thumbnail.png", "image/png", "ALTES BILD"),
    );
    expect(vorschaubildZiel(teile)).toBe("image.jpg");
    expect(Object.keys(teile)).not.toContain("thumbnail.png");
  });

  it("kommt ohne mitgebrachtes Vorschaubild aus", async () => {
    const teile = await paket(umgebung("/aasx/suppl/image.png"), ANHAENGE, null);
    expect(vorschaubildZiel(teile)).toBe("image.png");
    expect(strFromU8(teile["image.png"] as Uint8Array)).toBe("NEUES BILD");
  });

  it("weicht aus, statt denselben Pfad zweimal ins Paket zu legen", async () => {
    // Ein Anhang liegt bereits in der Wurzel und heisst wie die Vorschaubild-Quelle.
    const inDerWurzel = anhang("/image.png", "image/png", "ANHANG IN DER WURZEL");
    const attachments: AttachmentMap = new Map([
      [NEU.path, NEU],
      [inDerWurzel.path, inDerWurzel],
    ]);

    const teile = await paket(umgebung("/aasx/suppl/image.png"), attachments, null);

    expect(vorschaubildZiel(teile)).toBe("image-2.png");
    expect(strFromU8(teile["image-2.png"] as Uint8Array)).toBe("NEUES BILD");
    // Der fremde Anhang in der Wurzel bleibt unangetastet.
    expect(strFromU8(teile["image.png"] as Uint8Array)).toBe("ANHANG IN DER WURZEL");
  });
});

describe("collectPackageReferences", () => {
  it("findet File-Element und Vorschaubild als zwei Verweise auf dieselbe Datei", () => {
    const verweise = collectPackageReferences(normalize(umgebung("/aasx/suppl/image.png")));
    const aufBild = verweise.filter((verweis) => verweis.path === "/aasx/suppl/image.png");

    expect(aufBild).toHaveLength(2);
    expect(aufBild.map((verweis) => verweis.art).sort()).toEqual(["datei", "vorschaubild"]);
    // Zwei verschiedene Knoten, sonst zaehlte derselbe Verweis doppelt.
    expect(new Set(aufBild.map((verweis) => verweis.nodeId)).size).toBe(2);
  });

  it("zaehlt eine Datei ohne zweiten Verweis genau einmal", () => {
    const verweise = collectPackageReferences(normalize(umgebung("/aasx/suppl/andere.png")));
    expect(verweise.filter((verweis) => verweis.path === "/aasx/suppl/image.png")).toHaveLength(1);
  });

  it("uebergeht externe Verweise, sie sind kein Paketanhang", () => {
    const verweise = collectPackageReferences(normalize(umgebung("https://example.org/bild.png")));
    expect(verweise.every((verweis) => verweis.art === "datei")).toBe(true);
  });
});
