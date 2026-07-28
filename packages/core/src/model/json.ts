/**
 * Minimale JSON-Typen. Der Normalisierer arbeitet bewusst auf reinem JSON und nicht auf
 * den SDK-Klassen: reines JSON ist Immer-tauglich, strukturell teilbar und laesst sich
 * ohne die 401 KB der jsonization testen.
 */
export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;

export interface JsonObject {
  [key: string]: JsonValue;
}

export function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isJsonArray(value: JsonValue | undefined): value is JsonValue[] {
  return Array.isArray(value);
}
