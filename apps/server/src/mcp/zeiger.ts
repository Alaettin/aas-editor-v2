import type { JsonObject, JsonValue } from "@aas-editor/core";

/**
 * JSON Pointer nach RFC 6901, und die drei Aenderungen, die damit moeglich sind.
 *
 * Der Grund fuer dieses Modul ist der Uebertragungsweg: ein Environment von 34 KB noch
 * einmal zu schicken, um darin einen Wert zu berichtigen, ist die teuerste Art, eine
 * Kleinigkeit zu aendern. Mit einem Zeiger kostet dieselbe Aenderung ein paar Dutzend
 * Bytes.
 *
 * **Ohne Abhaengigkeit.** Der Standard ist kurz genug, um ihn hier zu haben, und eine
 * fremde Bibliothek fuer sechzig Zeilen zu ziehen waere ein Paket mehr, das jemand
 * pflegen und pruefen muss.
 *
 * Bewusst **nicht** JSON Patch (RFC 6902): dessen `test`, `move` und `copy` braucht hier
 * niemand, und `add` auf ein bestehendes Feld heisst dort ersetzen, was sich niemand
 * merkt. Drei Verben, die sagen, was sie tun.
 */

export type ZeigerOp = "setzen" | "entfernen" | "anfuegen";

export interface Patch {
  readonly op: ZeigerOp;
  readonly pfad: string;
  readonly wert?: JsonValue;
}

export class ZeigerFehler extends Error {}

/**
 * Die Segmente eines Zeigers, mit aufgeloester Maskierung.
 *
 * `~1` steht fuer `/` und `~0` fuer `~`, und die Reihenfolge ist nicht beliebig: erst `~1`,
 * dann `~0`. Andersherum wuerde aus `~01` erst `~1` und daraus faelschlich `/`.
 */
export function segmente(pfad: string): string[] {
  if (pfad === "") return [];
  if (!pfad.startsWith("/")) {
    throw new ZeigerFehler(`Ein Zeiger beginnt mit "/" oder ist leer, gelesen wurde "${pfad}".`);
  }
  return pfad
    .slice(1)
    .split("/")
    .map((teil) => teil.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function istObjekt(wert: JsonValue | undefined): wert is JsonObject {
  return typeof wert === "object" && wert !== null && !Array.isArray(wert);
}

/** Ein Segment auf einen Listenindex, oder `null` wenn es keiner ist. */
function alsIndex(segment: string, laenge: number): number | null {
  // Fuehrende Nullen sind laut RFC kein gueltiger Index, "01" ist nicht 1.
  if (!/^(0|[1-9][0-9]*)$/.test(segment)) return null;
  const index = Number(segment);
  return index <= laenge ? index : null;
}

/** Was an einem Zeiger steht. `undefined` heisst: dort steht nichts. */
export function lies(wurzel: JsonValue, pfad: string): JsonValue | undefined {
  let aktuell: JsonValue | undefined = wurzel;
  for (const segment of segmente(pfad)) {
    if (Array.isArray(aktuell)) {
      const index = alsIndex(segment, aktuell.length - 1);
      aktuell = index === null ? undefined : aktuell[index];
    } else if (istObjekt(aktuell)) {
      aktuell = aktuell[segment];
    } else {
      return undefined;
    }
    if (aktuell === undefined) return undefined;
  }
  return aktuell;
}

/**
 * Der Behaelter, in dem das letzte Segment sitzt.
 *
 * Getrennt vom Lesen, weil Aendern immer den Behaelter braucht und nie den Wert selbst.
 */
function elternteil(wurzel: JsonValue, teile: readonly string[], pfad: string): JsonValue {
  let aktuell: JsonValue = wurzel;
  for (const [i, segment] of teile.entries()) {
    let naechster: JsonValue | undefined;
    if (Array.isArray(aktuell)) {
      const index = alsIndex(segment, aktuell.length - 1);
      naechster = index === null ? undefined : aktuell[index];
    } else if (istObjekt(aktuell)) {
      naechster = aktuell[segment];
    }
    if (naechster === undefined || naechster === null) {
      throw new ZeigerFehler(
        `"${pfad}" fuehrt ins Leere: bei "/${teile.slice(0, i + 1).join("/")}" steht nichts.`,
      );
    }
    aktuell = naechster;
  }
  return aktuell;
}

/**
 * Wendet einen Patch an. **Aendert die Wurzel an Ort und Stelle.**
 *
 * Der Aufrufer arbeitet auf einer eigenen Kopie, siehe `wendeAn`: schlaegt ein Patch mitten
 * in einer Liste fehl, darf der Entwurf nicht halb geaendert zurueckbleiben.
 */
function wendeEinenAn(wurzel: JsonValue, patch: Patch): void {
  const teile = segmente(patch.pfad);
  if (teile.length === 0) {
    throw new ZeigerFehler("Der leere Zeiger meint das Ganze und laesst sich nicht patchen.");
  }

  const letztes = teile[teile.length - 1] as string;
  const ziel = elternteil(wurzel, teile.slice(0, -1), patch.pfad);

  if (patch.op !== "entfernen" && patch.wert === undefined) {
    throw new ZeigerFehler(`Fuer "${patch.op}" auf "${patch.pfad}" fehlt wert.`);
  }

  if (Array.isArray(ziel)) {
    if (patch.op === "anfuegen") {
      // "-" ist das Standardsegment fuer "hinter das letzte Element".
      if (letztes !== "-" && alsIndex(letztes, ziel.length) === null) {
        throw new ZeigerFehler(`"${patch.pfad}": in einer Liste haengt anfuegen an "-" oder an einen Index.`);
      }
      const index = letztes === "-" ? ziel.length : Number(letztes);
      ziel.splice(index, 0, patch.wert as JsonValue);
      return;
    }
    const index = alsIndex(letztes, ziel.length - 1);
    if (index === null) {
      throw new ZeigerFehler(`"${patch.pfad}": "${letztes}" ist kein gueltiger Index dieser Liste.`);
    }
    if (patch.op === "entfernen") ziel.splice(index, 1);
    else ziel[index] = patch.wert as JsonValue;
    return;
  }

  if (!istObjekt(ziel)) {
    throw new ZeigerFehler(`"${patch.pfad}": der Elternteil ist weder Objekt noch Liste.`);
  }

  if (patch.op === "entfernen") {
    if (!(letztes in ziel)) {
      throw new ZeigerFehler(`"${patch.pfad}" gibt es nicht, es ist nichts zu entfernen.`);
    }
    delete ziel[letztes];
    return;
  }
  if (patch.op === "anfuegen" && letztes in ziel) {
    throw new ZeigerFehler(
      `"${patch.pfad}" gibt es schon.`,
    );
  }
  ziel[letztes] = patch.wert as JsonValue;
}

/**
 * Wendet alle Patches an und gibt das Ergebnis zurueck.
 *
 * **Alles oder nichts.** Gearbeitet wird auf einer tiefen Kopie; wirft ein Patch, bleibt
 * der uebergebene Stand unberuehrt. Ein halb geaenderter Entwurf waere schlimmer als ein
 * abgelehnter: der Aufrufer wuesste nicht mehr, was drinsteht.
 */
export function wendeAn(wurzel: JsonObject, patches: readonly Patch[]): JsonObject {
  const kopie = structuredClone(wurzel);
  for (const [i, patch] of patches.entries()) {
    try {
      wendeEinenAn(kopie, patch);
    } catch (ursache) {
      if (ursache instanceof ZeigerFehler) {
        throw new ZeigerFehler(`Patch ${i + 1} von ${patches.length}: ${ursache.message}`);
      }
      throw ursache;
    }
  }
  return kopie;
}
