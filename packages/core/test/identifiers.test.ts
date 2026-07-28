import { describe, expect, it } from "vitest";

import { decodeIdentifier, encodeIdentifier } from "../src/identifiers.js";

/**
 * IDTA-01002 adressiert Identifiables ueber die base64url-kodierte `id`.
 * Gegenprobe gegen Node-Buffer, damit die eigene Implementierung nicht abweicht.
 */

const cases = [
  "https://example.com/aas/1",
  "urn:iso:std:iso:20022:tech:xsd:pain.001.001.03",
  "a",
  "ab",
  "abc",
  "Umlaute: Grosse Aenderung, scharfes s",
  "\u{1F600} Emoji und 中文",
  "",
];

describe("base64url-Kodierung fachlicher Identifikatoren", () => {
  it("stimmt mit der Node-Referenz ueberein", () => {
    for (const value of cases) {
      const reference = Buffer.from(value, "utf8").toString("base64url");
      expect(encodeIdentifier(value), value).toBe(reference);
    }
  });

  it("ist umkehrbar", () => {
    for (const value of cases) {
      expect(decodeIdentifier(encodeIdentifier(value)), value).toBe(value);
    }
  });

  it("erzeugt keine Zeichen, die in einem URL-Pfad kodiert werden muessten", () => {
    for (const value of cases) {
      const encoded = encodeIdentifier(value);
      expect(encoded).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(encodeURIComponent(encoded)).toBe(encoded);
    }
  });

  it("weist ungueltige Zeichen zurueck", () => {
    expect(() => decodeIdentifier("abc+def")).toThrow();
  });
});
