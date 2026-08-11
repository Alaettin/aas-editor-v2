import { WERKZEUGE } from "@aas-editor/core/assistent";
import OpenAI from "openai";
import type { Db } from "../db/client.js";
import type { ServerEnv } from "../env.js";
import { AppError } from "../errors.js";
import { leseSchluessel, lesen } from "./assistentEinstellung.js";

/**
 * Der Vermittler zu OpenAI.
 *
 * Der Server erzeugt hier nichts und entscheidet nichts; er haelt den Schluessel und
 * reicht durch. Der Gespraechsverlauf liegt im Browser, die Werkzeuge laufen im Browser,
 * und deshalb bleibt diese Datei zustandslos wie der Rest des Servers.
 *
 * Zwei Dinge legt der Server trotzdem fest und nicht der Klient: den Systemtext und die
 * Werkzeugliste. Beides kaeme sonst aus dem Browser, und dann bestimmt der Klient, was
 * das Modell darf.
 */

const SYSTEMTEXT = `Du bist der Assistent im AXON Editor, einem Editor fuer Verwaltungsschalen
nach IDTA-Metamodell 3.1 (Asset Administration Shell).

Du arbeitest ueber Werkzeuge am Modell, das der Nutzer gerade geoeffnet hat, samt seinen
ungesicherten Aenderungen. Schreibende Werkzeuge greifen sofort. Der Nutzer kann jeden
deiner Schritte mit Strg+Z zuruecknehmen, du brauchst also nicht vorab um Erlaubnis zu
fragen; nenne aber hinterher knapp, was du geaendert hast.

Arbeitsweise:
- modell_ueberblick rufst du **einmal zu Beginn eines Gespraechs**. Danach kennst du das
  Projekt; die Antwort steht weiter oben im Verlauf. Wieder aufrufen nur, wenn du eine
  Verwaltungsschale oder ein Teilmodell angelegt oder geloescht hast. Jeder ueberfluessige
  Aufruf kostet eine ganze Runde.
- Knoten sprichst du ueber ihre nodeId an. Die bekommst du aus den lesenden Werkzeugen,
  nie aus einer Vermutung. nodeIds aus frueheren Runden bleiben gueltig, solange der
  Knoten nicht geloescht wurde.
- Entstehen mehrere Elemente, nimm teilbaum_einfuegen mit einem vollstaendigen AAS-JSON,
  bei mehreren Geschwistern als Liste. Ein Aufruf statt vieler.
- Rufe mehrere unabhaengige Werkzeuge in derselben Runde auf, statt sie nacheinander
  ueber mehrere Runden zu verteilen.
- Schlaegt ein Werkzeug fehl, lies die Meldung und bessere nach, statt es unveraendert zu
  wiederholen.
- Erfinde keine semanticId. Wenn keine bekannt ist, lass das Feld leer und sage das.

Antworte kurz und in der Sprache des Nutzers. Fasse dich im Fliesstext: was du getan hast,
in ein bis zwei Saetzen. Keine Aufzaehlung dessen, was ohnehin als Werkzeugzeile dasteht.`;

/** Was der Browser schickt: die Elementliste der Responses-API, sonst nichts. */
export interface VermittlerAnfrage {
  readonly eingabe: readonly unknown[];
  readonly signal: AbortSignal;
}

export function pruefeEingabe(body: unknown): readonly unknown[] {
  const eingabe = (body as { eingabe?: unknown } | null)?.eingabe;
  if (!Array.isArray(eingabe) || eingabe.length === 0) {
    throw new AppError(400, "assistent-eingabe-fehlt", "Field 'eingabe' must be a non-empty array.");
  }
  /**
   * Ein Deckel, kein Rechtemodell: der Verlauf waechst mit jeder Werkzeugrunde, und eine
   * Schleife im Browser, die ausser Kontrolle geraet, soll nicht die Rechnung schreiben.
   */
  if (eingabe.length > 400) {
    throw new AppError(400, "assistent-eingabe-zu-lang", "Conversation is too long.");
  }
  return eingabe;
}

export type Anbieterstrom = AsyncIterable<{ type: string; [feld: string]: unknown }>;

/**
 * Wer den Anbieter ruft. Ausgetauscht wird das nur im Test: ein Strom, der erst schweigt
 * und dann liefert, ist die einzige Art, den Puls zu pruefen, ohne Schluessel, ohne Netz
 * und ohne eine Minute zu warten.
 */
export type Anbieter = (
  auftrag: { modell: string; eingabe: readonly unknown[]; schluessel: string },
  signal: AbortSignal,
) => Promise<Anbieterstrom>;

const OPENAI: Anbieter = async (auftrag, signal) => {
  const client = new OpenAI({ apiKey: auftrag.schluessel });
  return (await client.responses.create(
    {
      model: auftrag.modell,
      instructions: SYSTEMTEXT,
      input: auftrag.eingabe as never,
      tools: WERKZEUGE as never,
      /**
       * Kein Ablegen bei OpenAI. Wir schicken den Verlauf ohnehin bei jeder Runde
       * vollstaendig mit, `store: true` wuerde also nur Projektdaten dort liegen lassen,
       * ohne dass sie jemand liest.
       */
      store: false,
      stream: true,
    },
    { signal },
  )) as Anbieterstrom;
};

let anbieter: Anbieter = OPENAI;

/** Nur fuer Tests. Gibt die Funktion zurueck, die den vorigen Zustand wiederherstellt. */
export function setzeAnbieter(ersatz: Anbieter): () => void {
  anbieter = ersatz;
  return () => {
    anbieter = OPENAI;
  };
}

/**
 * Ereignisse der Responses-API als asynchroner Strom. Wirft, wenn kein Schluessel liegt,
 * bevor irgendetwas gesendet wurde: die Oberflaeche soll dann auf die Einstellungen
 * verweisen und nicht auf einen abgebrochenen Strom.
 */
export async function starteStrom(
  db: Db,
  env: ServerEnv,
  besitzer: string,
  anfrage: VermittlerAnfrage,
): Promise<Anbieterstrom> {
  const schluessel = leseSchluessel(db, env, besitzer);
  if (schluessel === null) {
    throw new AppError(
      412,
      "assistent-ohne-schluessel",
      "No OpenAI API key configured. Set one in the settings.",
    );
  }

  return anbieter(
    { modell: lesen(db, env, besitzer).modell, eingabe: anfrage.eingabe, schluessel },
    anfrage.signal,
  );
}
