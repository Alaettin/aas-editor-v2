import { create } from "zustand";
import { ApiError } from "../api/client";
import { laufeSchleife } from "../assistent/schleife";

/**
 * Der Assistent: Sichtbarkeit, Verlauf und der laufende Auftrag.
 *
 * Zwei Verlaeufe, mit Absicht. `eingabe` ist der Verlauf, den die Responses-API sieht:
 * eine Elementliste, die nur fortgeschrieben und nie umgeschrieben wird. `nachrichten`
 * ist, was auf dem Schirm steht. Der Versuch, beides aus einer Liste zu bedienen, endet
 * damit, dass eine Anzeigeentscheidung den Verlauf des Modells veraendert.
 *
 * Antwortlogik steht hier weiterhin nicht: erzeugt wird in `assistent/schleife.ts`,
 * ausgefuehrt in `assistent/ausfuehren.ts`.
 */

export interface Schritt {
  /** Werkzeugname aus dem Katalog. Die Anzeige waehlt daran Symbol und Farbe. */
  readonly werkzeug: string;
  readonly text: string;
  readonly istFehler: boolean;
}

/**
 * Je Frage **eine** Karte. Text aus mehreren Werkzeugrunden sammelt sich darin als
 * Absaetze, die Schritte darunter als Liste; sonst zerfaellt eine Antwort in so viele
 * Bloecke, wie das Modell Runden gebraucht hat, und das sieht der Nutzer als Zufall.
 */
export type Anzeige =
  | { readonly art: "nutzer"; readonly text: string }
  | { readonly art: "assistent"; readonly text: string; readonly schritte: readonly Schritt[] }
  /** Abriss oder Anbieterfehler: gehoert keiner Karte, das Gespraech ist hier zu Ende. */
  | { readonly art: "fehler"; readonly text: string };

interface AssistantState {
  offen: boolean;
  umschalten: () => void;
  setzen: (offen: boolean) => void;

  nachrichten: readonly Anzeige[];
  /** Der Verlauf, wie ihn die API sieht. Undurchsichtig fuer die Oberflaeche. */
  eingabe: readonly unknown[];
  laeuft: boolean;
  /**
   * Token des **ganzen Gespraechs**, nicht der letzten Runde. Jede Werkzeugrunde schickt
   * den vollen Verlauf erneut, die Summe waechst also ueberproportional; genau das soll
   * der Nutzer sehen, bevor die Rechnung es ihm sagt.
   */
  verbrauch: { eingabe: number; ausgabe: number } | null;

  fragen: (text: string) => Promise<void>;
  abbrechen: () => void;
  leeren: () => void;
}

let laufenderAbbruch: AbortController | null = null;

function anhaengen(nachrichten: readonly Anzeige[], neu: Anzeige): readonly Anzeige[] {
  return [...nachrichten, neu];
}

/**
 * Aendert die letzte Karte der laufenden Antwort. Sie ist immer die letzte Nachricht:
 * angelegt wird sie beim Absenden der Frage, und danach kommt bis zum Ende der Runde
 * nichts anderes hinzu.
 */
function inKarte(
  nachrichten: readonly Anzeige[],
  aendern: (karte: Extract<Anzeige, { art: "assistent" }>) => Anzeige,
): readonly Anzeige[] {
  const letzte = nachrichten[nachrichten.length - 1];
  if (letzte?.art !== "assistent") return nachrichten;
  return [...nachrichten.slice(0, -1), aendern(letzte)];
}

export const useAssistant = create<AssistantState>()((set, get) => ({
  offen: false,
  umschalten: () => set({ offen: !get().offen }),
  setzen: (offen) => set({ offen }),

  nachrichten: [],
  eingabe: [],
  laeuft: false,
  verbrauch: null,

  fragen: async (text) => {
    if (get().laeuft || text.trim() === "") return;

    const abbruch = new AbortController();
    laufenderAbbruch = abbruch;

    const eingabe = [
      ...get().eingabe,
      { role: "user", content: [{ type: "input_text", text }] },
    ];
    // Frage und die leere Karte, die sie beantwortet, in einem Schritt: die Karte ist ab
    // jetzt die letzte Nachricht, und alles Folgende dieser Runde geht hinein.
    set({
      laeuft: true,
      eingabe,
      nachrichten: [
        ...get().nachrichten,
        { art: "nutzer", text },
        { art: "assistent", text: "", schritte: [] },
      ],
    });

    /*
     * Der Text kommt stueckweise und ueber mehrere Runden. `fertig` haelt, was fruehere
     * Runden gesagt haben, `laufend` die aktuelle; dazwischen eine Leerzeile, weil das
     * Modell zwischen zwei Werkzeugrunden meist ansagt, was es als Naechstes tut.
     */
    let fertig = "";
    let laufend = "";
    const schreibeAntwort = (stueck: string) => {
      laufend += stueck;
      set({
        nachrichten: inKarte(get().nachrichten, (karte) => ({ ...karte, text: fertig + laufend })),
      });
    };
    const rundeAbschliessen = () => {
      if (laufend === "") return;
      fertig = `${fertig}${laufend}\n\n`;
      laufend = "";
    };

    try {
      const verlauf = await laufeSchleife(eingabe, abbruch.signal, {
        text: schreibeAntwort,
        werkzeug: (schritt) => {
          // Ein Werkzeug laeuft nach dem Text seiner Runde: die Runde ist damit vorbei.
          rundeAbschliessen();
          set({
            nachrichten: inKarte(get().nachrichten, (karte) => ({
              ...karte,
              schritte: [...karte.schritte, schritt],
            })),
          });
        },
        verbrauch: (roh) => {
          const zahlen = roh as { input_tokens?: number; output_tokens?: number } | null;
          const bisher = get().verbrauch ?? { eingabe: 0, ausgabe: 0 };
          set({
            verbrauch: {
              eingabe: bisher.eingabe + (zahlen?.input_tokens ?? 0),
              ausgabe: bisher.ausgabe + (zahlen?.output_tokens ?? 0),
            },
          });
        },
      });
      set({ eingabe: verlauf });
    } catch (fehler) {
      if (!abbruch.signal.aborted) {
        const text = fehler instanceof ApiError ? fehler.text : (fehler as Error).message;
        set({ nachrichten: anhaengen(get().nachrichten, { art: "fehler", text }) });
      }
    } finally {
      /*
       * Eine Karte, die weder Text noch Schritte bekommen hat, waere ein leerer Rahmen.
       * Das passiert beim Abbruch und wenn der Strom vor dem ersten Wort reisst.
       */
      set({
        nachrichten: get().nachrichten.filter(
          (nachricht) =>
            nachricht.art !== "assistent" ||
            nachricht.text !== "" ||
            nachricht.schritte.length > 0,
        ),
      });
      if (laufenderAbbruch === abbruch) laufenderAbbruch = null;
      set({ laeuft: false });
    }
  },

  abbrechen: () => {
    laufenderAbbruch?.abort();
    laufenderAbbruch = null;
    set({ laeuft: false });
  },

  /** Neues Gespraech. Das Modell im Editor bleibt, wie es ist. */
  leeren: () => set({ nachrichten: [], eingabe: [], verbrauch: null }),
}));
