import { expect } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * Der MCP-Zugang von aussen, ueber `app.inject()`.
 *
 * Geprueft wird durchweg das Protokoll und nicht die Werkzeugfunktion einzeln: ein
 * Werkzeug, das fuer sich richtig rechnet, aber nicht angemeldet ist oder ein Schema
 * traegt, das der Klient ablehnt, ist im Chat trotzdem nicht da.
 */

export interface RpcRumpf {
  readonly result?: Record<string, unknown>;
  readonly error?: { code: number; message: string };
}

export interface RpcAntwort extends RpcRumpf {
  readonly status: number;
}

export interface WerkzeugAntwort {
  readonly istFehler: boolean;
  readonly daten: Record<string, unknown>;
}

let laufendeId = 0;

export async function rpc(
  app: FastifyInstance,
  methode: string,
  params?: unknown,
): Promise<RpcAntwort> {
  laufendeId += 1;
  const antwort = await app.inject({
    method: "POST",
    url: "/api/mcp",
    headers: {
      "content-type": "application/json",
      // Beides, so verlangt es Streamable HTTP, auch wenn der Server hier JSON antwortet.
      accept: "application/json, text/event-stream",
    },
    payload: { jsonrpc: "2.0", id: laufendeId, method: methode, ...(params ? { params } : {}) },
  });

  if (antwort.statusCode >= 400 && antwort.payload === "") {
    return { status: antwort.statusCode };
  }
  const rumpf = antwort.json() as RpcRumpf;
  return { ...rumpf, status: antwort.statusCode };
}

/** Ein Werkzeugaufruf, samt Auspacken des Textinhalts. */
export async function ruf(
  app: FastifyInstance,
  name: string,
  args: Record<string, unknown>,
): Promise<WerkzeugAntwort> {
  const antwort = await rpc(app, "tools/call", { name, arguments: args });
  expect(antwort.error, `${name} antwortete mit einem Protokollfehler`).toBeUndefined();
  const inhalt = (antwort.result?.["content"] as { type: string; text: string }[]) ?? [];
  const ersteZeile = inhalt[0];
  expect(ersteZeile, `${name} lieferte keinen Inhalt`).toBeDefined();
  return {
    istFehler: antwort.result?.["isError"] === true,
    daten: JSON.parse(ersteZeile?.text ?? "{}") as Record<string, unknown>,
  };
}

/**
 * Ein multipart-Rumpf von Hand.
 *
 * `app.inject()` bringt keinen Formulardaten-Bauer mit, und eine Bibliothek dafuer
 * einzuziehen waere fuer drei Kopfzeilen zu viel.
 */
export function multipart(
  dateiname: string,
  contentType: string,
  bytes: Buffer,
): { headers: Record<string, string>; payload: Buffer } {
  const grenze = `----aas${Math.abs(dateiname.length * 7919 + bytes.byteLength)}`;
  const payload = Buffer.concat([
    Buffer.from(
      `--${grenze}\r\n` +
        `Content-Disposition: form-data; name="datei"; filename="${dateiname}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${grenze}--\r\n`),
  ]);
  return {
    headers: { "content-type": `multipart/form-data; boundary=${grenze}` },
    payload,
  };
}

/** Ein winziges, gueltiges PNG. Reicht als Anhang und als Vorschaubild. */
export const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export const PDF_BYTES = Buffer.from("%PDF-1.4\n% Testdatei\n");
export const PDF_BASE64 = PDF_BYTES.toString("base64");

/** Das kleinste Environment, das die Pruefung fehlerfrei passiert. */
export const GUELTIG = {
  submodels: [
    {
      modelType: "Submodel",
      id: "urn:test:submodel:1",
      idShort: "Typenschild",
      submodelElements: [
        { modelType: "Property", idShort: "Hersteller", valueType: "xs:string", value: "AXON" },
      ],
    },
  ],
};

/** Environment mit einem File-Element und einem defaultThumbnail. */
export const MIT_ANHANG = {
  assetAdministrationShells: [
    {
      modelType: "AssetAdministrationShell",
      id: "urn:test:aas:1",
      idShort: "Geraet",
      assetInformation: {
        assetKind: "Instance",
        globalAssetId: "urn:test:asset:1",
        defaultThumbnail: { path: "/aasx/files/vorschau.png", contentType: "image/png" },
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
          value: "/aasx/files/datenblatt.pdf",
        },
      ],
    },
  ],
};

/** Ein Anhangseintrag, wie ihn `aas_datei_erzeugen` erwartet: alle Quellen genannt. */
export function anhang(
  pfad: string,
  contentType: string | null,
  quelle: { base64?: string; url?: string; token?: string },
): Record<string, unknown> {
  return {
    pfad,
    contentType,
    base64: quelle.base64 ?? null,
    url: quelle.url ?? null,
    token: quelle.token ?? null,
  };
}
