import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, api, onSitzungAbgelaufen } from "../src/api/client";

/**
 * Die Fehlerabbildung ist der Teil des Klienten, an dem das Frontend haengt: der
 * Konfliktdialog schaltet auf `code`, die Anmeldung auf den Status 401.
 */

function antwort(status: number, body: unknown, ok = status < 400): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  onSitzungAbgelaufen(null);
});

describe("api-Klient", () => {
  it("gibt den Rumpf bei Erfolg zurueck", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(antwort(200, { a: 1 })));
    await expect(api<{ a: number }>("/api/test")).resolves.toEqual({ a: 1 });
  });

  it("bildet einen Fehler auf ApiError ab, mit code und Details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        antwort(409, {
          code: "doppelte-id",
          message: "Zwei Elemente tragen dieselbe id.",
          id: "https://beispiel.de/sm/1",
        }),
      ),
    );

    const fehler = await api("/api/test").catch((error: unknown) => error);
    expect(fehler).toBeInstanceOf(ApiError);
    expect((fehler as ApiError).code).toBe("doppelte-id");
    expect((fehler as ApiError).status).toBe(409);
    expect((fehler as ApiError).details["id"]).toBe("https://beispiel.de/sm/1");
  });

  it("meldet eine verlorene Sitzung genau einmal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(antwort(401, { code: "nicht-angemeldet" })));
    const gemeldet = vi.fn();
    onSitzungAbgelaufen(gemeldet);

    await api("/api/eins").catch(() => undefined);
    await api("/api/zwei").catch(() => undefined);

    expect(gemeldet).toHaveBeenCalledTimes(1);
  });

  it("laesst die Anmeldung selbst mit 401 in Ruhe", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(antwort(401, { code: "nicht-angemeldet" })));
    const gemeldet = vi.fn();
    onSitzungAbgelaufen(gemeldet);

    await api("/api/auth/login", { method: "POST", ohneWeiterleitung: true }).catch(
      () => undefined,
    );

    expect(gemeldet).not.toHaveBeenCalled();
  });
});
