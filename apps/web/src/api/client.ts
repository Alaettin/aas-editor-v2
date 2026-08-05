import i18n from "@/i18n";

/**
 * Duenne Huelle um fetch. Kein Cache, keine zweite Zustandsverwaltung: bei einer Handvoll
 * Endpunkten waere eine Abfragebibliothek neben Zustand ein zweites Paradigma ohne Gewinn.
 *
 * Die Sitzung steckt im httpOnly-Cookie, deshalb "same-origin" statt eines Tokens.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }

  /**
   * Der Satz in der eingestellten Sprache.
   *
   * Der Server liefert einen stabilen `code` und eine englische Meldung fuer Protokolle;
   * uebersetzt wird hier. Kennt die Sprachdatei den Code nicht, bleibt die Rohmeldung
   * stehen: eine erfundene Uebersetzung waere schlechter als eine englische, die stimmt.
   */
  get text(): string {
    const schluessel = `fehler.server.${this.code}`;
    const uebersetzt = i18n.t(schluessel, this.details) as string;
    return uebersetzt === schluessel ? this.message : uebersetzt;
  }
}

export type Method = "GET" | "POST" | "PUT" | "DELETE";

interface RequestOptions {
  readonly method?: Method;
  readonly body?: unknown;
  /** Bei 401 nicht auf die Anmeldung lenken. Fuer die Pruefung "bin ich angemeldet". */
  readonly ohneWeiterleitung?: boolean;
}

let aufAnmeldungGelenkt = false;

/** Wird von RequireAuth gesetzt, damit der Klient den Router nicht kennen muss. */
let beiAbmeldung: (() => void) | null = null;

export function onSitzungAbgelaufen(handler: (() => void) | null): void {
  beiAbmeldung = handler;
  aufAnmeldungGelenkt = false;
}

async function fehlerAus(response: Response): Promise<ApiError> {
  let code = "serverfehler";
  let message = i18n.t("fehler.serverAntwortete", { status: response.status });
  let details: Record<string, unknown> = {};
  try {
    const body = (await response.json()) as Record<string, unknown>;
    if (typeof body["code"] === "string") code = body["code"];
    if (typeof body["message"] === "string") message = body["message"];
    details = body;
  } catch {
    // Antwort ohne JSON, die Vorgabe oben bleibt stehen.
  }
  return new ApiError(response.status, code, message, details);
}

async function pruefe(response: Response, ohneWeiterleitung: boolean): Promise<void> {
  if (response.ok) return;
  const fehler = await fehlerAus(response);
  if (response.status === 401 && !ohneWeiterleitung && !aufAnmeldungGelenkt) {
    // Genau einmal lenken: sonst kaempfen mehrere gleichzeitige Anfragen um die Route.
    aufAnmeldungGelenkt = true;
    beiAbmeldung?.();
  }
  throw fehler;
}

export async function api<T>(pfad: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(pfad, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    ...(options.body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(options.body) }),
  });

  await pruefe(response, options.ohneWeiterleitung ?? false);
  aufAnmeldungGelenkt = false;
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiBytes(pfad: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const response = await fetch(pfad, { credentials: "same-origin" });
  await pruefe(response, false);
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
  };
}

export async function apiUpload<T>(pfad: string, form: FormData): Promise<T> {
  const response = await fetch(pfad, { method: "POST", credentials: "same-origin", body: form });
  await pruefe(response, false);
  return (await response.json()) as T;
}
