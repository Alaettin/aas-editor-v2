/**
 * Der Werkzeugkatalog des Assistenten.
 *
 * Reine Daten, kein Verhalten. Zwei Seiten lesen diese Datei:
 * der Server schickt die Schemata mit dem Aufruf an OpenAI, das Frontend fuehrt die
 * Werkzeuge in `apps/web/src/assistent/ausfuehren.ts` gegen das offene Modell aus.
 * Deshalb steht der Katalog hier und nicht auf einer der beiden Seiten.
 *
 * Format ist die **Responses-API**: ein Werkzeug ist flach, `name` und `parameters`
 * stehen neben `type`, es gibt keine `function`-Verschachtelung.
 *
 * `strict: true` verlangt zweierlei: `additionalProperties: false`, und **jedes** Feld
 * muss in `required` stehen. Ein optionales Feld gibt es damit nicht; es wird als
 * `required` mit Typ `["string", "null"]` gefuehrt, und `null` heisst „nicht angegeben".
 */

import { SUBMODEL_ELEMENT_KINDS, IDENTIFIABLE_KINDS } from "../model/kinds.js";

/** JSON-Schema, so weit die Responses-API es im strengen Modus zulaesst. */
export interface WerkzeugSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, unknown>>;
  readonly required: readonly string[];
  readonly additionalProperties: false;
}

export interface Werkzeug {
  readonly type: "function";
  readonly name: string;
  readonly description: string;
  readonly parameters: WerkzeugSchema;
  readonly strict: true;
}

/** Kuerzel fuer ein Feld, das auch fehlen darf. */
function optional(typ: "string" | "integer", beschreibung: string) {
  return { type: [typ, "null"], description: beschreibung };
}

function pflicht(typ: "string" | "integer", beschreibung: string) {
  return { type: typ, description: beschreibung };
}

function werkzeug(
  name: string,
  description: string,
  properties: Record<string, unknown>,
): Werkzeug {
  return {
    type: "function",
    name,
    description,
    parameters: {
      type: "object",
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    },
    strict: true,
  };
}

/** Alle Arten, die `element_anlegen` erzeugen kann. */
const ANLEGBARE_ARTEN = [...IDENTIFIABLE_KINDS, ...SUBMODEL_ELEMENT_KINDS];

export const WERKZEUGE: readonly Werkzeug[] = [
  // --- lesend ---------------------------------------------------------------
  werkzeug(
    "modell_ueberblick",
    "Ueberblick ueber das offene Projekt: Name, Anzahl Knoten, alle Verwaltungsschalen " +
      "mit ihren Teilmodellen und die freien Teilmodelle. Der richtige erste Aufruf, wenn " +
      "noch nichts ueber das Projekt bekannt ist.",
    {},
  ),
  werkzeug(
    "baum_lesen",
    "Die Kinder eines Knotens, nach Slot gruppiert. Ohne nodeId beginnt es an der Wurzel " +
      "(Environment). Gedeckelt auf 200 Knoten je Aufruf.",
    {
      nodeId: optional("string", "Knoten, dessen Kinder gelesen werden. null heisst Wurzel."),
      tiefe: optional("integer", "Wie viele Ebenen tief, 1 bis 5. null heisst 1."),
    },
  ),
  werkzeug(
    "element_lesen",
    "Alle Felder eines Knotens samt Feldbeschreibung aus der Formularvorlage und, falls " +
      "eine semanticId gesetzt ist, der aufgeloesten Begriffsdefinition.",
    { nodeId: pflicht("string", "Knoten, der gelesen wird.") },
  ),
  werkzeug(
    "suchen",
    "Volltextsuche ueber idShort, id, semanticId, Wert und Art. Mehrere Woerter werden " +
      "mit UND verknuepft und muessen alle im selben Knoten stehen.",
    {
      text: pflicht("string", "Suchbegriff, Woerter mit Leerzeichen getrennt."),
      limit: optional("integer", "Hoechstzahl Treffer, 1 bis 50. null heisst 20."),
    },
  ),
  werkzeug(
    "finden",
    "Einen Knoten gezielt aufloesen. Genau eines der drei Felder wird angegeben, die " +
      "anderen beiden bleiben null.",
    {
      id: optional("string", "Fachliche id eines Identifiable, etwa eine urn."),
      idShort: optional("string", "idShort, exakt. Mehrdeutige Treffer werden alle geliefert."),
      aasPath: optional("string", "Pfad wie .submodels[0].submodelElements[2]."),
    },
  ),
  werkzeug(
    "befunde_lesen",
    "Die Befunde der Pruefung: Verstoesse gegen die Spezifikation und eigene Warnungen, " +
      "je mit Regel, Text und betroffenem Knoten. Gedeckelt auf 100 Befunde.",
    {
      nodeId: optional("string", "Nur Befunde zu diesem Knoten. null heisst alle."),
    },
  ),
  werkzeug(
    "auswahl_lesen",
    "Welcher Knoten im Baum gerade ausgewaehlt ist. Nuetzlich, wenn der Nutzer von " +
      "'diesem Element' spricht.",
    {},
  ),

  // --- schreibend -----------------------------------------------------------
  werkzeug(
    "auswaehlen",
    "Einen Knoten im Baum auswaehlen, damit der Nutzer sieht, wovon die Rede ist. " +
      "Aendert das Modell nicht.",
    { nodeId: pflicht("string", "Knoten, der ausgewaehlt wird.") },
  ),
  werkzeug(
    "feld_setzen",
    "Ein Feld eines Knotens setzen. Einfache Werte kommen in wert, verschachtelte Werte " +
      "(Sprachtexte, Referenzen, Qualifier) als JSON-Text in wertJson. Genau eines der " +
      "beiden Felder wird gefuellt. Sind beide null, wird das Feld geleert.",
    {
      nodeId: pflicht("string", "Knoten, dessen Feld gesetzt wird."),
      feld: pflicht("string", "Feldname, etwa idShort, value oder valueType."),
      wert: optional("string", "Einfacher Wert als Text."),
      wertJson: optional("string", "Verschachtelter Wert als JSON-Text."),
    },
  ),
  werkzeug(
    "element_anlegen",
    "Ein neues Element unter einem Elternknoten anlegen. Pflichtfelder der Art werden " +
      "vorbelegt, damit das Modell gueltig bleibt. Fuer mehrere Elemente auf einmal ist " +
      "teilbaum_einfuegen der bessere Weg.",
    {
      elternId: pflicht("string", "Knoten, unter dem angelegt wird."),
      slot: pflicht(
        "string",
        "Kindliste, etwa submodels, submodelElements, value, statements oder annotations.",
      ),
      art: {
        type: "string",
        enum: ANLEGBARE_ARTEN,
        description: "Art des neuen Elements.",
      },
      idShort: optional("string", "idShort. null vergibt einen freien Namen."),
      id: optional("string", "Fachliche id, nur bei Identifiables. null vergibt eine urn."),
    },
  ),
  werkzeug(
    "element_loeschen",
    "Einen Knoten samt allen Nachfahren loeschen. Die Wurzel laesst sich nicht loeschen.",
    { nodeId: pflicht("string", "Knoten, der geloescht wird.") },
  ),
  werkzeug(
    "element_verschieben",
    "Einen Knoten an eine andere Stelle haengen. Ein Knoten kann nicht in seine eigenen " +
      "Nachfahren wandern.",
    {
      nodeId: pflicht("string", "Knoten, der verschoben wird."),
      zielId: pflicht("string", "Neuer Elternknoten."),
      slot: pflicht("string", "Kindliste im Zielknoten."),
      index: optional("integer", "Platz in der Zielliste. null haengt hinten an."),
    },
  ),
  werkzeug(
    "element_duplizieren",
    "Einen Knoten samt Nachfahren kopieren. Die Kopie steht direkt hinter dem Original " +
      "und bekommt neue id und idShort.",
    { nodeId: pflicht("string", "Knoten, der kopiert wird.") },
  ),
  werkzeug(
    "teilbaum_einfuegen",
    "Einen oder mehrere Teilbaeume aus AAS-JSON einfuegen, etwa ein vollstaendiges " +
      "Teilmodell mit allen Elementen oder mehrere Properties auf einmal. Der bevorzugte " +
      "Weg, sobald mehr als ein Element entsteht: ein Aufruf statt vieler. Kollidierende " +
      "ids bekommen neue.",
    {
      elternId: pflicht("string", "Knoten, unter dem eingefuegt wird."),
      slot: pflicht("string", "Kindliste im Elternknoten."),
      json: pflicht(
        "string",
        "AAS-JSON als Text, jedes Element mit modelType. Entweder ein Objekt " +
          "(etwa ein Submodel samt submodelElements) oder eine Liste von Objekten.",
      ),
    },
  ),
];

export const WERKZEUG_NAMEN: readonly string[] = WERKZEUGE.map((w) => w.name);

/** Ob ein vom Modell genannter Name im Katalog steht. */
export function istWerkzeugName(name: string): boolean {
  return WERKZEUG_NAMEN.includes(name);
}
