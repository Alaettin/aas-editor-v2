import { sendeRunde } from "../api/assistent";
import { fuehreWerkzeugAus } from "./ausfuehren";

/**
 * Die Werkzeugschleife.
 *
 * Ablauf einer Runde: senden, Strom lesen, die vom Modell gelieferte Ausgabeliste an den
 * Verlauf haengen, jeden `function_call` ausfuehren und je Aufruf ein
 * `function_call_output` mit derselben `call_id` anhaengen. Enthaelt eine Runde keinen
 * Aufruf mehr, ist der Assistent fertig.
 *
 * Angehaengt wird **die Liste aus `response.completed`**, nicht der mitgelesene Text.
 * Sonst haetten ein sauber beendeter und ein abgerissener Strom denselben Verlauf, und
 * die naechste Runde liefe auf einer halben Antwort weiter.
 */

/** Mehr Runden heisst fast immer: das Modell dreht sich im Kreis, auf Rechnung des Nutzers. */
const MAX_RUNDEN = 12;

interface Werkzeugaufruf {
  readonly type: string;
  readonly name?: string;
  readonly call_id?: string;
  readonly arguments?: string;
}

export interface Rueckmeldung {
  /** Ein Stueck laufender Text. */
  readonly text: (stueck: string) => void;
  /**
   * Ein Werkzeug ist gelaufen. Der **Name** geht mit, nicht nur der fertige Satz: die
   * Anzeige waehlt daran ihr Symbol und unterscheidet lesend von schreibend.
   */
  readonly werkzeug: (schritt: {
    werkzeug: string;
    text: string;
    istFehler: boolean;
  }) => void;
  /** Eine Runde ist zu Ende, mit dem Verbrauch des Anbieters. */
  readonly verbrauch: (verbrauch: unknown) => void;
}

function argumenteAus(aufruf: Werkzeugaufruf): Record<string, unknown> {
  try {
    return JSON.parse(aufruf.arguments ?? "{}") as Record<string, unknown>;
  } catch {
    // Kaputtes JSON ist ein Fehler des Modells, kein Grund abzubrechen: der Aufruf
    // scheitert unten mit lesbarer Meldung und das Modell versucht es erneut.
    return {};
  }
}

/**
 * Laesst den Assistenten laufen, bis er nichts mehr aufruft. Liefert den fortgeschriebenen
 * Verlauf, damit die naechste Frage darauf aufsetzt.
 */
export async function laufeSchleife(
  eingabe: readonly unknown[],
  signal: AbortSignal,
  rueckmeldung: Rueckmeldung,
): Promise<readonly unknown[]> {
  let verlauf = [...eingabe];

  for (let runde = 0; runde < MAX_RUNDEN; runde += 1) {
    let ausgabe: readonly unknown[] = [];

    for await (const ereignis of sendeRunde(verlauf, signal)) {
      switch (ereignis.art) {
        case "text":
          rueckmeldung.text(ereignis.text);
          break;
        case "fertig":
          ausgabe = ereignis.ausgabe;
          rueckmeldung.verbrauch(ereignis.verbrauch);
          break;
        case "fehler":
          throw new Error(ereignis.meldung);
        default:
          break;
      }
    }

    verlauf = [...verlauf, ...ausgabe];

    const aufrufe = ausgabe.filter(
      (teil): teil is Werkzeugaufruf =>
        typeof teil === "object" && teil !== null && (teil as Werkzeugaufruf).type === "function_call",
    );
    if (aufrufe.length === 0) return verlauf;

    for (const aufruf of aufrufe) {
      const name = aufruf.name ?? "";
      const ergebnis = fuehreWerkzeugAus(name, argumenteAus(aufruf));
      rueckmeldung.werkzeug({
        werkzeug: name,
        text: ergebnis.anzeige,
        istFehler: ergebnis.istFehler,
      });
      verlauf.push({
        type: "function_call_output",
        call_id: aufruf.call_id,
        output: ergebnis.ausgabe,
      });
    }
  }

  throw new Error(`Abgebrochen nach ${MAX_RUNDEN} Werkzeugrunden.`);
}
