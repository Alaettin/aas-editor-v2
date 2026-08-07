import {
  baueAufloeser,
  buildPathIndex,
  childSlotsOf,
  countNodes,
  describeSemanticId,
  fragmentFromJson,
  istKernFehler,
  resolvePath,
  search,
  specOf,
  submodelsJeShell,
  walk,
  type EditorModel,
  type JsonValue,
  type NodeId,
} from "@aas-editor/core";
import { useEditor } from "../store/editor";

/**
 * Die Werkzeuge des Assistenten, ausgefuehrt gegen das offene Modell.
 *
 * **Warum im Browser und nicht im Server:** der Editor haelt das Modell samt
 * ungesicherter Aenderungen; der Server kennt nur den zuletzt gespeicherten Stand. Nur
 * hier arbeitet der Assistent an dem, was der Nutzer sieht. Nebenwirkung, und zwar die
 * gewollte: schreibende Werkzeuge gehen durch dieselben Store-Aktionen wie jede Geste
 * der Oberflaeche, also gelten Rueckgaengig und der orange Punkt in der Fusszeile
 * unveraendert.
 *
 * Jedes Ergebnis ist gedeckelt. Ein Baum mit zehntausend Knoten als Werkzeugantwort
 * spraengte das Fenster und kostete bei jeder weiteren Runde erneut.
 */

const DECKEL_BAUM = 200;
const DECKEL_SUCHE = 50;
const DECKEL_BEFUNDE = 100;

export interface WerkzeugErgebnis {
  /** Was als `function_call_output` zurueckgeht. Immer Text, so will es die API. */
  readonly ausgabe: string;
  /** Kurzform fuer die Anzeige im Panel. */
  readonly anzeige: string;
  readonly istFehler: boolean;
}

function gelungen(wert: unknown, anzeige: string): WerkzeugErgebnis {
  return { ausgabe: JSON.stringify(wert), anzeige, istFehler: false };
}

function fehlgeschlagen(meldung: string): WerkzeugErgebnis {
  return {
    ausgabe: JSON.stringify({ fehler: meldung }),
    anzeige: meldung,
    istFehler: true,
  };
}

function knoten(model: EditorModel, nodeId: unknown) {
  if (typeof nodeId !== "string" || !model.nodes[nodeId]) {
    throw new Error(`Unbekannte nodeId: ${String(nodeId)}`);
  }
  return model.nodes[nodeId];
}

function beschrifte(model: EditorModel, nodeId: NodeId): string {
  const n = model.nodes[nodeId];
  if (!n) return nodeId;
  const idShort = n.data["idShort"];
  return typeof idShort === "string" && idShort !== "" ? idShort : n.kind;
}

/** Ein Knoten in Kurzform, so wie der Assistent ihn in Listen zu sehen bekommt. */
function kurz(model: EditorModel, nodeId: NodeId) {
  const n = model.nodes[nodeId];
  if (!n) return { nodeId };
  return {
    nodeId,
    art: n.kind,
    idShort: n.data["idShort"] ?? null,
    id: n.data["id"] ?? null,
    kinder: Object.values(n.children).reduce((summe, liste) => summe + liste.length, 0),
  };
}

function baum(model: EditorModel, wurzel: NodeId, tiefe: number) {
  let uebrig = DECKEL_BAUM;

  const bauen = (nodeId: NodeId, rest: number): unknown => {
    const n = model.nodes[nodeId];
    if (!n || uebrig <= 0) return null;
    const eintrag: Record<string, unknown> = kurz(model, nodeId);
    if (rest <= 0) return eintrag;

    const slots: Record<string, unknown[]> = {};
    for (const [slot, kinder] of Object.entries(n.children)) {
      if (kinder.length === 0) continue;
      slots[slot] = [];
      for (const kind of kinder) {
        if (uebrig <= 0) break;
        uebrig -= 1;
        slots[slot].push(bauen(kind, rest - 1));
      }
    }
    if (Object.keys(slots).length > 0) eintrag["slots"] = slots;
    return eintrag;
  };

  const ergebnis = bauen(wurzel, tiefe);
  return { baum: ergebnis, gekuerzt: uebrig <= 0 };
}

/**
 * Welche Knoten seit dem Merken dazugekommen sind.
 *
 * Die nodeId des neuen Knotens laesst sich **nicht** aus `nextNodeId` vorhersagen: wie
 * viele Zaehlerschritte eine Aenderung kostet und in welcher Reihenfolge sie vergeben
 * werden, ist Sache des Kerns. Ein Vergleich der Knotenmengen ist gegen jede Reihenfolge
 * immun; die Vorhersage war es nicht, und sie war stumm falsch.
 */
function dazugekommen(vorher: ReadonlySet<string>, nachher: EditorModel): NodeId[] {
  return Object.keys(nachher.nodes).filter((nodeId) => !vorher.has(nodeId));
}

/**
 * Der Editor-Store faengt Kernfehler ab und zeigt sie dem Nutzer als Meldung; die Aktion
 * gibt danach ganz normal zurueck. Fuer eine Geste ist das richtig, fuer den Assistenten
 * waere es fatal: er bekaeme "erledigt" gemeldet, waehrend nichts geschehen ist, und
 * baute darauf auf. Jede schreibende Aktion prueft deshalb hinterher ihre Wirkung.
 */
function pruefeWirkung(eingetreten: boolean, meldung: string): WerkzeugErgebnis | null {
  return eingetreten ? null : fehlgeschlagen(meldung);
}

/** Einfacher Wert oder JSON-Text; beides null heisst „Feld leeren". */
function wertAus(argumente: Record<string, unknown>): JsonValue | undefined {
  const json = argumente["wertJson"];
  if (typeof json === "string" && json.trim() !== "") {
    return JSON.parse(json) as JsonValue;
  }
  const wert = argumente["wert"];
  if (typeof wert === "string") return wert;
  return undefined;
}

/**
 * Fuehrt einen Werkzeugaufruf aus. Wirft nie: ein Fehler ist ein Ergebnis, das das Modell
 * lesen und nachbessern kann. Ein geworfener Fehler wuerde stattdessen die ganze Runde
 * abbrechen und den Nutzer mit einem halben Ergebnis stehen lassen.
 */
export function fuehreWerkzeugAus(name: string, argumente: Record<string, unknown>): WerkzeugErgebnis {
  const store = useEditor.getState();
  const model = store.model;
  if (!model) return fehlgeschlagen("Es ist kein Projekt geoeffnet.");

  try {
    switch (name) {
      // --- lesend ---------------------------------------------------------
      case "modell_ueberblick": {
        const zuordnung = submodelsJeShell(model);
        return gelungen(
          {
            projekt: store.projektName,
            knoten: countNodes(model),
            ungesichert: store.dirty,
            schalen: [...zuordnung.jeShell].map(([shellId, submodels]) => ({
              ...kurz(model, shellId),
              teilmodelle: submodels.map((id) => kurz(model, id)),
            })),
            freieTeilmodelle: zuordnung.frei.map((id) => kurz(model, id)),
          },
          "Ueberblick gelesen",
        );
      }

      case "baum_lesen": {
        const wurzel = (argumente["nodeId"] as string | null) ?? model.rootId;
        knoten(model, wurzel);
        const tiefe = Math.min(Math.max(Number(argumente["tiefe"] ?? 1), 1), 5);
        return gelungen(baum(model, wurzel, tiefe), "Baum gelesen");
      }

      case "element_lesen": {
        const n = knoten(model, argumente["nodeId"]);
        const spec = specOf(n.kind);
        return gelungen(
          {
            ...kurz(model, n.nodeId),
            eltern: n.parent,
            slot: n.slot,
            daten: n.data,
            felder: spec?.groups.flatMap((gruppe) => gruppe.fields.map((feld) => feld.key)) ?? [],
            semantik: describeSemanticId(model, n.data["semanticId"]),
          },
          `${beschrifte(model, n.nodeId)} gelesen`,
        );
      }

      case "suchen": {
        const text = String(argumente["text"] ?? "");
        const limit = Math.min(Math.max(Number(argumente["limit"] ?? 20), 1), DECKEL_SUCHE);
        const treffer = search(model, text, limit);
        return gelungen(
          { treffer: treffer.map((t) => ({ ...kurz(model, t.nodeId), auszug: t.excerpt })) },
          `${treffer.length} Treffer fuer "${text}"`,
        );
      }

      case "finden": {
        const id = argumente["id"];
        const idShort = argumente["idShort"];
        const aasPath = argumente["aasPath"];

        if (typeof id === "string" && id !== "") {
          const nodeId = baueAufloeser(model).byAasId.get(id) ?? null;
          return gelungen(
            { treffer: nodeId === null ? [] : [kurz(model, nodeId)] },
            `id ${id} aufgeloest`,
          );
        }
        if (typeof idShort === "string" && idShort !== "") {
          const treffer = [...walk(model)]
            .filter((n) => n.data["idShort"] === idShort)
            .map((n) => kurz(model, n.nodeId));
          return gelungen({ treffer }, `${treffer.length} Treffer fuer ${idShort}`);
        }
        if (typeof aasPath === "string" && aasPath !== "") {
          const stelle = resolvePath(buildPathIndex(model), aasPath);
          return gelungen(
            { treffer: stelle === null ? [] : [{ ...kurz(model, stelle.nodeId), feld: stelle.field }] },
            `Pfad ${aasPath} aufgeloest`,
          );
        }
        return fehlgeschlagen("Genau eines der Felder id, idShort oder aasPath wird gebraucht.");
      }

      case "befunde_lesen": {
        const nodeId = argumente["nodeId"];
        const alle = store.issues.filter(
          (befund) => typeof nodeId !== "string" || befund.nodeId === nodeId,
        );
        return gelungen(
          {
            anzahl: alle.length,
            befunde: alle.slice(0, DECKEL_BEFUNDE).map((befund) => ({
              schwere: befund.severity,
              regel: befund.constraintId ?? befund.schluessel,
              text: befund.message,
              nodeId: befund.nodeId,
              feld: befund.field,
              pfad: befund.aasPath,
            })),
          },
          `${alle.length} Befunde`,
        );
      }

      case "auswahl_lesen":
        return gelungen(
          { auswahl: store.selection === null ? null : kurz(model, store.selection) },
          "Auswahl gelesen",
        );

      // --- schreibend -----------------------------------------------------
      case "auswaehlen": {
        const n = knoten(model, argumente["nodeId"]);
        store.goToNode(n.nodeId);
        return gelungen({ ausgewaehlt: n.nodeId }, `${beschrifte(model, n.nodeId)} ausgewaehlt`);
      }

      case "feld_setzen": {
        const n = knoten(model, argumente["nodeId"]);
        const feld = String(argumente["feld"] ?? "");
        if (feld === "") return fehlgeschlagen("Das Feld braucht einen Namen.");
        const gewuenscht = wertAus(argumente);
        store.updateField(n.nodeId, feld, gewuenscht);

        const gesetzt = useEditor.getState().model?.nodes[n.nodeId]?.data[feld];
        // Der Kern loescht leere Werte statt sie zu setzen, das ist kein Fehlschlag.
        const wieGewuenscht =
          JSON.stringify(gesetzt ?? null) === JSON.stringify(gewuenscht ?? null) ||
          (gesetzt === undefined && (gewuenscht === "" || gewuenscht === undefined));
        const abgelehnt = pruefeWirkung(
          wieGewuenscht,
          `${feld} wurde nicht uebernommen. Der Wert passt nicht zum Feld.`,
        );
        if (abgelehnt) return abgelehnt;

        return gelungen(
          { nodeId: n.nodeId, feld, wert: gesetzt ?? null },
          `${feld} an ${beschrifte(model, n.nodeId)} gesetzt`,
        );
      }

      case "element_anlegen": {
        const eltern = knoten(model, argumente["elternId"]);
        const slot = String(argumente["slot"] ?? "");
        const art = String(argumente["art"] ?? "");
        const erlaubteSlots = childSlotsOf(eltern.kind).map((s) => s.name);
        if (!erlaubteSlots.includes(slot)) {
          return fehlgeschlagen(
            `${eltern.kind} kennt den Slot ${slot} nicht. Moeglich: ${erlaubteSlots.join(", ") || "keiner"}.`,
          );
        }

        const vorher = new Set(Object.keys(model.nodes));
        store.addElement(eltern.nodeId, slot, art);
        const neu = dazugekommen(vorher, useEditor.getState().model as EditorModel)[0];
        if (neu === undefined) {
          return fehlgeschlagen(`${art} liess sich unter ${slot} nicht anlegen.`);
        }

        const idShort = argumente["idShort"];
        if (typeof idShort === "string" && idShort !== "") {
          store.updateField(neu, "idShort", idShort);
        }
        const id = argumente["id"];
        if (typeof id === "string" && id !== "") store.updateField(neu, "id", id);

        return gelungen(
          kurz(useEditor.getState().model as EditorModel, neu),
          `${art} ${typeof idShort === "string" ? idShort : ""} angelegt`.trim(),
        );
      }

      case "element_loeschen": {
        const n = knoten(model, argumente["nodeId"]);
        const name = beschrifte(model, n.nodeId);
        store.deleteElement(n.nodeId);
        const abgelehnt = pruefeWirkung(
          useEditor.getState().model?.nodes[n.nodeId] === undefined,
          `${name} liess sich nicht loeschen. Die Wurzel des Modells bleibt bestehen.`,
        );
        if (abgelehnt) return abgelehnt;
        return gelungen({ geloescht: n.nodeId }, `${name} geloescht`);
      }

      case "element_verschieben": {
        const n = knoten(model, argumente["nodeId"]);
        const ziel = knoten(model, argumente["zielId"]);
        const index = argumente["index"];
        store.moveElement(
          n.nodeId,
          ziel.nodeId,
          String(argumente["slot"] ?? ""),
          typeof index === "number" ? index : undefined,
        );
        const abgelehnt = pruefeWirkung(
          useEditor.getState().model?.nodes[n.nodeId]?.parent === ziel.nodeId,
          `${beschrifte(model, n.nodeId)} liess sich nicht dorthin verschieben. ` +
            "Ein Knoten kann nicht in seine eigenen Nachfahren und nicht in einen Slot, den das Ziel nicht kennt.",
        );
        if (abgelehnt) return abgelehnt;

        return gelungen(
          { verschoben: n.nodeId, ziel: ziel.nodeId },
          `${beschrifte(model, n.nodeId)} verschoben`,
        );
      }

      case "element_duplizieren": {
        const n = knoten(model, argumente["nodeId"]);
        const vorher = new Set(Object.keys(model.nodes));
        store.duplicateElement(n.nodeId);
        const danach = useEditor.getState().model as EditorModel;
        // Die Kopie ist der neue Knoten mit demselben Elternteil wie das Original.
        const kopie = dazugekommen(vorher, danach).find(
          (nodeId) => danach.nodes[nodeId]?.parent === n.parent,
        );
        if (kopie === undefined) return fehlgeschlagen("Der Knoten liess sich nicht kopieren.");
        return gelungen(kurz(danach, kopie), `${beschrifte(model, n.nodeId)} kopiert`);
      }

      case "teilbaum_einfuegen": {
        const eltern = knoten(model, argumente["elternId"]);
        const slot = String(argumente["slot"] ?? "");

        /*
         * Auch eine Liste, nicht nur ein Objekt. Wer zwei Properties nachtragen will,
         * schickt sonst ein Array, `fragmentFromJson` wirft `modell.keinEinzelobjekt`,
         * und das Modell faellt auf Einzelaufrufe zurueck: genau die Runden, die dieses
         * Werkzeug sparen soll.
         */
        const roh = JSON.parse(String(argumente["json"] ?? "null")) as unknown;
        const teile = Array.isArray(roh) ? roh : [roh];
        if (teile.length === 0) return fehlgeschlagen("Der Teilbaum war leer.");

        const eingefuegt: unknown[] = [];
        for (const teil of teile) {
          const fragment = fragmentFromJson(JSON.stringify(teil));
          // "neue-id": eine Kollision soll nichts ueberschreiben, was schon dasteht.
          const ergebnis = store.pasteInto(eltern.nodeId, slot, fragment, "neue-id");
          if (ergebnis === null || ergebnis.nodeId === null) {
            return fehlgeschlagen(
              `${fragment.kind} liess sich unter ${slot} nicht einfuegen.` +
                (eingefuegt.length > 0 ? ` ${String(eingefuegt.length)} davor sind drin.` : ""),
            );
          }
          eingefuegt.push({
            ...kurz(useEditor.getState().model as EditorModel, ergebnis.nodeId),
            ergebnis: ergebnis.outcome,
          });
        }

        return gelungen(
          { eingefuegt },
          eingefuegt.length === 1
            ? `${beschrifte(useEditor.getState().model as EditorModel, (eingefuegt[0] as { nodeId: NodeId }).nodeId)} eingefuegt`
            : `${String(eingefuegt.length)} Elemente eingefuegt`,
        );
      }

      default:
        return fehlgeschlagen(`Unbekanntes Werkzeug: ${name}`);
    }
  } catch (fehler) {
    /*
     * KernFehler tragen einen Schluessel und keinen Satz. Der Assistent braucht aber
     * etwas Lesbares, und uebersetzt wird in der Oberflaeche, nicht hier: der Schluessel
     * selbst ist praezise genug, damit das Modell den naechsten Versuch anders anlegt.
     */
    if (istKernFehler(fehler)) return fehlgeschlagen(`${fehler.schluessel}: ${fehler.message}`);
    return fehlgeschlagen((fehler as Error).message);
  }
}
