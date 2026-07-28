/**
 * base64url-Kodierung fachlicher Identifikatoren.
 *
 * IDTA-01002 adressiert Identifiables ueber die base64url-kodierte `id` im Pfad. Der
 * Editor soll spaeter selbst als Submodel Repository dienen (Plan Abschnitt 1 und 9),
 * deshalb liegt die Kodierung hier im Kern und nicht in einem Route-Handler.
 *
 * Bewusst ohne Node-Buffer und ohne `btoa`, damit das Modul im Worker, im Browser und
 * im Backend gleich funktioniert.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function encodeIdentifier(id: string): string {
  const bytes = new TextEncoder().encode(id);
  let out = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] as number;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];

    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += ALPHABET[b2 & 0x3f];
  }

  return out;
}

export function decodeIdentifier(encoded: string): string {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of encoded) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) throw new Error(`Kein gueltiges base64url-Zeichen: ${JSON.stringify(char)}`);
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
}
