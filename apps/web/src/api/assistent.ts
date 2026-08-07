import { ApiError, api } from "./client";

/**
 * Die beiden Endpunkte des Assistenten.
 *
 * Der Strom laeuft nicht ueber `api()`: das ist eine Huelle um `response.json()`, und
 * hier kommen Ereignisse stueckweise. EventSource scheidet aus, weil die Eingabeliste
 * im Rumpf steht und EventSource nur GET kann.
 */

export interface AssistentEinstellung {
  readonly gesetzt: boolean;
  readonly endung: string | null;
  readonly modell: string;
  readonly modelle: readonly { id: string; eingabe: number; ausgabe: number }[];
}

export const einstellungApi = {
  lesen: () => api<AssistentEinstellung>("/api/einstellungen/assistent"),
  setzen: (werte: { schluessel?: string; modell?: string }) =>
    api<AssistentEinstellung>("/api/einstellungen/assistent", { method: "PUT", body: werte }),
  loeschen: () =>
    api<AssistentEinstellung>("/api/einstellungen/assistent", { method: "DELETE" }),
};

export type StromEreignis =
  | { art: "text"; text: string }
  | { art: "werkzeug"; name: string }
  | { art: "fertig"; ausgabe: readonly unknown[]; verbrauch: unknown }
  | { art: "fehler"; code: string; meldung: string };

/**
 * Eine Runde. Liefert die Ereignisse in der Reihenfolge, in der sie ankommen.
 *
 * Ein Fehler **vor** dem Strom (kein Schluessel hinterlegt, nicht angemeldet) kommt als
 * `ApiError` heraus, damit die Oberflaeche darauf zeigen kann. Ein Fehler **im** Strom
 * kommt als Ereignis, denn da steht schon Text auf dem Schirm.
 */
export async function* sendeRunde(
  eingabe: readonly unknown[],
  signal: AbortSignal,
): AsyncGenerator<StromEreignis> {
  /*
   * Reisst die Leitung, wirft `fetch` den Wortlaut des Browsers: "NetworkError when
   * attempting to fetch resource". Das ist kein Satz fuer einen Nutzer, und es sagt ihm
   * auch nicht, was jetzt gilt. Ein eigener Code, den die Sprachdatei uebersetzt.
   */
  let response: Response;
  try {
    response = await fetch("/api/assistent/nachricht", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eingabe }),
      signal,
    });
  } catch (ausnahme) {
    if (signal.aborted) throw ausnahme;
    throw new ApiError(0, "assistent-abriss", (ausnahme as Error).message);
  }

  if (!response.ok || response.body === null) {
    let code = "serverfehler";
    let meldung = `Server antwortete mit ${response.status}.`;
    let details: Record<string, unknown> = {};
    try {
      const body = (await response.json()) as Record<string, unknown>;
      if (typeof body["code"] === "string") code = body["code"];
      if (typeof body["message"] === "string") meldung = body["message"];
      details = body;
    } catch {
      // Antwort ohne JSON, die Vorgabe oben bleibt stehen.
    }
    throw new ApiError(response.status, code, meldung, details);
  }

  const leser = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let puffer = "";

  try {
    for (;;) {
      let stueck: ReadableStreamReadResult<string>;
      try {
        stueck = await leser.read();
      } catch (ausnahme) {
        // Mitten im Strom abgerissen. Was schon angezeigt wurde, bleibt stehen.
        if (signal.aborted) throw ausnahme;
        throw new ApiError(0, "assistent-abriss", (ausnahme as Error).message);
      }
      const { done, value } = stueck;
      if (done) break;
      puffer += value;

      // SSE trennt Ereignisse mit einer Leerzeile. Ein Stueck kann mitten in einem
      // Ereignis enden, deshalb bleibt der Rest im Puffer stehen.
      let grenze = puffer.indexOf("\n\n");
      while (grenze !== -1) {
        const block = puffer.slice(0, grenze);
        puffer = puffer.slice(grenze + 2);
        const zeile = block.split("\n").find((z) => z.startsWith("data: "));
        if (zeile !== undefined) yield JSON.parse(zeile.slice(6)) as StromEreignis;
        grenze = puffer.indexOf("\n\n");
      }
    }
  } finally {
    await leser.cancel().catch(() => undefined);
  }
}
