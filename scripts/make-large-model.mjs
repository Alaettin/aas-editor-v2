#!/usr/bin/env node
/**
 * Erzeugt ein grosses, gueltiges AAS-Environment als Messgrundlage (Plan Abschnitt 10).
 *
 * Die offiziellen Konformitaetsdaten aus `pnpm test-data` sind winzig, an ihnen laesst
 * sich nichts profilieren. Dieses Skript baut stattdessen ein Modell mit rund zehntausend
 * Elementen, und zwar **deterministisch**: derselbe Aufruf liefert Byte fuer Byte dieselbe
 * Datei. Ohne das waeren zwei Messungen nicht vergleichbar.
 *
 *   node scripts/make-large-model.mjs [anzahl]
 *
 * Die Ausgabe landet unter `test-data/gross/`, dem einzigen Ordner im Repo, der ohnehin
 * nicht eingecheckt wird.
 *
 * Bewusst ohne jede Abhaengigkeit: das Skript laeuft unter blossem Node und kann deshalb
 * `@aas-editor/core` (TypeScript) nicht importieren. Dass das Ergebnis wirklich gueltig
 * ist, weist `apps/web/test/leistung.test.ts` nach, dort steht die Validierung zur
 * Verfuegung.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASIS = "https://beispiel.aas-editor.de";

/** Eine sehr breite Sammlung, damit der quadratische Fall im Baum wirklich getroffen wird. */
const BREITE_SAMMLUNG = 2000;
/** Aufbau eines gewoehnlichen Teilmodells: aussen mal innen mal Blaetter. */
const AUSSEN = 5;
const INNEN = 4;
const BLATT = 18;
const CONCEPT_DESCRIPTIONS = 50;

/** Linearer Kongruenzgenerator. Nur fuer Textlaengen, damit die Datei realistisch gross wird. */
function streuer(saat) {
  let zustand = saat >>> 0;
  return () => {
    zustand = (zustand * 1664525 + 1013904223) >>> 0;
    return zustand / 4294967296;
  };
}

const zufall = streuer(20260805);

const WOERTER = [
  "Drehzahl",
  "Temperatur",
  "Betriebsstunden",
  "Seriennummer",
  "Hersteller",
  "Anschlussleistung",
  "Schutzart",
  "Gewicht",
  "Baujahr",
  "Wartungsintervall",
];

function text(laenge) {
  const teile = [];
  while (teile.join(" ").length < laenge) {
    teile.push(WOERTER[Math.floor(zufall() * WOERTER.length)]);
  }
  return teile.join(" ");
}

function eigenschaft(name) {
  return {
    idShort: name,
    valueType: "xs:string",
    value: text(12 + Math.floor(zufall() * 40)),
    modelType: "Property",
  };
}

function mehrsprachig(name) {
  return {
    idShort: name,
    value: [
      { language: "de", text: text(20) },
      { language: "en", text: text(20) },
    ],
    modelType: "MultiLanguageProperty",
  };
}

function bereich(name) {
  return {
    idShort: name,
    valueType: "xs:int",
    min: String(Math.floor(zufall() * 100)),
    max: String(200 + Math.floor(zufall() * 100)),
    modelType: "Range",
  };
}

function verweis(name, ziel) {
  return {
    idShort: name,
    value: { type: "ExternalReference", keys: [{ type: "GlobalReference", value: ziel }] },
    modelType: "ReferenceElement",
  };
}

function sammlung(name, inhalt) {
  return { idShort: name, value: inhalt, modelType: "SubmodelElementCollection" };
}

function blaetter(praefix) {
  const out = [];
  for (let i = 0; i < BLATT; i += 1) out.push(eigenschaft(`${praefix}_Wert${String(i)}`));
  out.push(mehrsprachig(`${praefix}_Beschreibung`));
  out.push(bereich(`${praefix}_Spanne`));
  out.push(verweis(`${praefix}_Quelle`, `${BASIS}/cd/${praefix}`));
  return out;
}

function gewoehnlichesTeilmodell(nummer) {
  const aussen = [];
  for (let a = 0; a < AUSSEN; a += 1) {
    const innen = [];
    for (let i = 0; i < INNEN; i += 1) {
      innen.push(
        sammlung(`Gruppe${String(i)}`, blaetter(`Sm${String(nummer)}_${String(a)}_${String(i)}`)),
      );
    }
    aussen.push(sammlung(`Block${String(a)}`, innen));
  }

  return {
    id: `${BASIS}/sm/teilmodell-${String(nummer)}`,
    idShort: `Teilmodell${String(nummer)}`,
    kind: "Instance",
    semanticId: {
      type: "ExternalReference",
      keys: [{ type: "GlobalReference", value: `${BASIS}/cd/teilmodell-${String(nummer % 7)}` }],
    },
    submodelElements: aussen,
    modelType: "Submodel",
  };
}

/**
 * Ein Teilmodell mit einer sehr breiten Sammlung. Genau hier faellt auf, ob der Baum je
 * Zeile ueber alle Geschwister laeuft: bei zweitausend Kindern sind das vier Millionen
 * Zugriffe je Aufbau.
 */
function breitesTeilmodell() {
  const kinder = [];
  for (let i = 0; i < BREITE_SAMMLUNG; i += 1) kinder.push(eigenschaft(`Posten${String(i)}`));

  return {
    id: `${BASIS}/sm/breite-liste`,
    idShort: "BreiteListe",
    kind: "Instance",
    submodelElements: [sammlung("Alle", kinder)],
    modelType: "Submodel",
  };
}

function conceptDescriptions() {
  const out = [];
  for (let i = 0; i < CONCEPT_DESCRIPTIONS; i += 1) {
    out.push({
      id: `${BASIS}/cd/teilmodell-${String(i)}`,
      idShort: `Begriff${String(i)}`,
      modelType: "ConceptDescription",
    });
  }
  return out;
}

/** Zaehlt die Knoten so, wie der Editor sie spaeter im Baum haelt. */
function zaehle(wert) {
  if (Array.isArray(wert)) return wert.reduce((summe, eintrag) => summe + zaehle(eintrag), 0);
  if (wert === null || typeof wert !== "object") return 0;
  const eigen = typeof wert["modelType"] === "string" ? 1 : 0;
  let summe = eigen;
  for (const inhalt of Object.values(wert)) summe += zaehle(inhalt);
  return summe;
}

function baue(ziel) {
  // Ein gewoehnliches Teilmodell traegt eine feste Zahl an Knoten. Daraus ergibt sich,
  // wie viele davon noetig sind, um das Ziel zu treffen.
  const proTeilmodell = zaehle(gewoehnlichesTeilmodell(0));
  const breit = breitesTeilmodell();
  const rest = ziel - zaehle(breit) - CONCEPT_DESCRIPTIONS - 1;
  const anzahl = Math.max(1, Math.round(rest / proTeilmodell));

  const submodels = [];
  for (let i = 0; i < anzahl; i += 1) submodels.push(gewoehnlichesTeilmodell(i));
  submodels.push(breit);

  const schale = {
    id: `${BASIS}/aas/anlage`,
    idShort: "Anlage",
    assetInformation: { assetKind: "Instance", globalAssetId: `${BASIS}/asset/anlage` },
    submodels: submodels.map((sm) => ({
      type: "ModelReference",
      keys: [{ type: "Submodel", value: sm.id }],
    })),
    modelType: "AssetAdministrationShell",
  };

  return {
    assetAdministrationShells: [schale],
    submodels,
    conceptDescriptions: conceptDescriptions(),
  };
}

const ziel = Number(process.argv[2] ?? 10000);
if (!Number.isFinite(ziel) || ziel < 100) {
  console.error("Anzahl muss eine Zahl ab 100 sein.");
  process.exit(1);
}

const environment = baue(ziel);
// Die Umgebung selbst ist im Editor die Wurzelzeile und zaehlt mit.
const knoten = zaehle(environment) + 1;
const ordner = join(WURZEL, "test-data", "gross");
const datei = join(ordner, `modell-${String(ziel)}.json`);

mkdirSync(ordner, { recursive: true });
const inhalt = JSON.stringify(environment);
writeFileSync(datei, inhalt);

console.log(`${datei}`);
console.log(`Knoten: ${String(knoten)} (Ziel ${String(ziel)})`);
console.log(`Groesse: ${(inhalt.length / 1024 / 1024).toFixed(2)} MB`);
