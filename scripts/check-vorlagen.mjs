#!/usr/bin/env node
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Prueft, ob die IDTA neuere Fassungen der eingecheckten Teilmodellvorlagen
 * veroeffentlicht hat.
 *
 * **Von Hand, nicht zur Laufzeit.** Der Server fragt beim Herausgeber nichts nach: ein
 * Netzaufruf in einem Werkzeug, das ohne Netz auskommt, waere eine stille Abhaengigkeit
 * von einem fremden Ordner. Und die CI haengt nicht daran, sonst faellt der Bau um, sobald
 * jemand bei der IDTA umsortiert.
 *
 * Genau das ist naemlich der Fall, gegen den dieses Skript gebaut ist: die Fassungen, die
 * am 10.08.2026 gesucht wurden (Nameplate 2.0, Technical Data 1.2, Handover Documentation
 * 1.2), standen unter `published` nicht mehr. Wer eine Fassung festschreibt, sollte
 * mitbekommen, wenn daneben eine neue steht.
 */

const API = "https://api.github.com/repos/admin-shell-io/submodel-templates/contents/published";

/** Was eingecheckt ist, und wo es beim Herausgeber herkommt. */
const VORLAGEN = [
  { datei: "nameplate-3-0.json", ordner: "Digital nameplate", fassung: [3, 0] },
  { datei: "technicaldata-2-0.json", ordner: "Technical_Data", fassung: [2, 0] },
  { datei: "handoverdocumentation-2-0-1.json", ordner: "Handover Documentation", fassung: [2, 0] },
];

const ORDNER = fileURLToPath(new URL("../apps/server/vorlagen", import.meta.url));

async function verzeichnis(pfad) {
  const antwort = await fetch(`${API}/${pfad.split("/").map(encodeURIComponent).join("/")}`, {
    headers: { accept: "application/vnd.github+json", "user-agent": "axon-editor" },
  });
  if (!antwort.ok) throw new Error(`${pfad}: HTTP ${antwort.status}`);
  return await antwort.json();
}

/** Die Zahlenordner unterhalb eines Pfades, absteigend. */
async function zahlen(pfad) {
  const eintraege = await verzeichnis(pfad);
  return eintraege
    .filter((e) => e.type === "dir" && /^\d+$/.test(e.name))
    .map((e) => Number(e.name))
    .sort((a, b) => b - a);
}

const vorhanden = new Set(readdirSync(ORDNER));
let neueres = 0;
let fehlend = 0;

for (const vorlage of VORLAGEN) {
  if (!vorhanden.has(vorlage.datei)) {
    console.log(`FEHLT   ${vorlage.datei} liegt nicht in apps/server/vorlagen/`);
    fehlend += 1;
    continue;
  }

  let majors;
  try {
    majors = await zahlen(vorlage.ordner);
  } catch (fehler) {
    console.log(`? ${vorlage.ordner}: ${fehler.message}`);
    continue;
  }

  const [major, minor] = vorlage.fassung;
  const hoechsterMajor = majors[0] ?? 0;
  let hoechsterMinor = minor;
  if (hoechsterMajor === major) {
    const minors = await zahlen(`${vorlage.ordner}/${major}`);
    hoechsterMinor = minors[0] ?? minor;
  }

  const neuer = hoechsterMajor > major || (hoechsterMajor === major && hoechsterMinor > minor);
  if (neuer) {
    console.log(
      `NEUER   ${vorlage.ordner}: eingecheckt ${major}.${minor}, ` +
        `veroeffentlicht ${hoechsterMajor}.${hoechsterMinor}`,
    );
    neueres += 1;
  } else {
    console.log(`aktuell ${vorlage.ordner} ${major}.${minor}`);
  }
}

console.log();
if (fehlend > 0) {
  console.log(`${fehlend} Vorlage(n) fehlen im Repo.`);
  process.exit(1);
}
if (neueres > 0) {
  console.log(
    `${neueres} Vorlage(n) haben eine neuere Fassung. Die neue Datei danebenlegen und in\n` +
      `KATALOG in apps/server/src/mcp/vorlagen.ts eintragen; die alte bleibt stehen,\n` +
      `solange jemand ihre Kennung benutzt.`,
  );
  process.exit(1);
}
console.log("Alle eingecheckten Vorlagen sind die neuesten veroeffentlichten.");
