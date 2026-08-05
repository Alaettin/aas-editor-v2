import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import de from "../src/i18n/de.json" with { type: "json" };

/**
 * Beide Richtungen.
 *
 * Jeder `t("...")`-Aufruf muss einen Schluessel in de.json finden: bei rund achtzig neuen
 * Zeichenketten in einer Phase ist ein vergessener Schluessel keine Frage des Ob. Er
 * faellt sonst erst auf, wenn im Bildschirm "menu.datei" steht.
 *
 * Und umgekehrt: kein Schluessel darf ungenutzt herumliegen. Nach Phase 8 waren
 * fuenfundzwanzig davon tot, darunter der komplette `speichern.`-Block, waehrend die
 * Statusleiste dieselben Zustaende unuebersetzt zeigte. Ein toter Schluessel ist kein
 * Schoenheitsfehler, sondern der Hinweis auf eine Anzeige, die es nicht mehr gibt, oder
 * auf eine, die ihren Text woanders herholt.
 */

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function dateien(verzeichnis: string): string[] {
  const treffer: string[] = [];
  for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
    const voll = join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) treffer.push(...dateien(voll));
    else if (/\.tsx?$/.test(eintrag.name)) treffer.push(voll);
  }
  return treffer;
}

function vorhanden(schluessel: string): boolean {
  let aktuell: unknown = de;
  for (const teil of schluessel.split(".")) {
    if (typeof aktuell !== "object" || aktuell === null) return false;
    aktuell = (aktuell as Record<string, unknown>)[teil];
  }
  if (aktuell !== undefined) return true;

  // Pluralformen liegen als eigene Schluessel vor, i18next waehlt daraus aus.
  const eltern = schluessel.slice(0, schluessel.lastIndexOf("."));
  const blatt = schluessel.slice(schluessel.lastIndexOf(".") + 1);
  let block: unknown = de;
  for (const teil of eltern.split(".")) {
    if (typeof block !== "object" || block === null) return false;
    block = (block as Record<string, unknown>)[teil];
  }
  if (typeof block !== "object" || block === null) return false;
  return Object.keys(block).some((name) => name.startsWith(`${blatt}_`));
}

describe("Uebersetzungen", () => {
  it("kennt jeden benutzten Schluessel", () => {
    const fehlend = new Set<string>();

    for (const datei of dateien(SRC)) {
      const inhalt = readFileSync(datei, "utf8");
      for (const treffer of inhalt.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) {
        const schluessel = treffer[1]!;
        // Schluessel aus dem Kern (Feldbeschreibungen) liegen unter feld. und gruppe.
        if (!vorhanden(schluessel)) fehlend.add(`${schluessel}  (${datei.slice(SRC.length + 1)})`);
      }
    }

    expect([...fehlend].sort()).toEqual([]);
  });

  it("hat keinen Schluessel, den niemand benutzt", () => {
    const quelltext = dateien(SRC)
      .map((datei) => readFileSync(datei, "utf8"))
      .join("\n");

    const unbenutzt: string[] = [];
    for (const schluessel of alleSchluessel(de)) {
      // Feste Aufrufe, Aufrufe mit Werten und die Praefixe zusammengesetzter Aufrufe
      // wie t(`tabelle.spalte.${id}`) oder t(`sicht.${sicht}`).
      if (quelltext.includes(`"${schluessel}"`)) continue;
      if (BAUSTEINE.some((praefix) => schluessel.startsWith(praefix))) continue;
      unbenutzt.push(schluessel);
    }

    expect(unbenutzt.sort()).toEqual([]);
  });
});

/**
 * Schluessel, die nur ueber ein Praefix zusammengesetzt werden. Sie stehen nie als
 * Zeichenkette im Quelltext und muessen deshalb hier benannt sein, damit die Ausnahme
 * eine Entscheidung bleibt und kein Loch.
 */
const BAUSTEINE = [
  "tabelle.spalte.",
  "sicht.",
  "export.",
  "feld.",
  "gruppe.",
  "befund.regel.",
  // Die Beschriftung des Speichern-Knopfes folgt dem Serverzustand, siehe Toolbar.
  "speichern.",
];

/** Alle Blattschluessel in Punktschreibweise. Pluralformen zaehlen als ihr Grundschluessel. */
function alleSchluessel(baum: unknown, praefix = ""): string[] {
  if (typeof baum !== "object" || baum === null) return [praefix];
  const treffer: string[] = [];
  for (const [name, wert] of Object.entries(baum as Record<string, unknown>)) {
    const voll = praefix === "" ? name : `${praefix}.${name}`;
    // i18next-Pluralformen: "knoten_one" gehoert zu "knoten".
    treffer.push(...alleSchluessel(wert, voll.replace(/_(one|other|zero|few|many)$/, "")));
  }
  return treffer;
}
