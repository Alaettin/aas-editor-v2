import * as Comlink from "comlink";

import { meldeFehler } from "@/lib/melden";
import type { AasWorkerApi } from "./protocol.js";

/**
 * Zugang zum AAS-Worker. Der Worker wird erst beim ersten Zugriff gestartet, damit
 * das Startbundle nicht auf ihn wartet.
 *
 * Stirbt der Worker, ist das die unangenehmste Fehlerart im ganzen Programm: Comlink
 * wartet auf eine Antwort, die nie kommt, und **jeder** weitere Aufruf haengt still.
 * Kein Fehler, keine Meldung, nur ein Editor, der nichts mehr tut. Deshalb haengen hier
 * zwei Zuhoerer, die das melden und die Bruecke zuruecksetzen: der naechste Aufruf
 * bekommt dann einen frischen Worker statt eines toten Comlink.
 */

let worker: Worker | null = null;
let api: Comlink.Remote<AasWorkerApi> | null = null;

export function aasWorker(): Comlink.Remote<AasWorkerApi> {
  if (!api) {
    worker = new Worker(new URL("./aas.worker.ts", import.meta.url), { type: "module" });

    // `error` faengt eine Ausnahme im Worker selbst, `messageerror` eine Nachricht, die
    // sich nicht klonen liess. Beides beendet die Verstaendigung, nicht unbedingt den
    // Worker; zuruecksetzen muss man in beiden Faellen.
    worker.addEventListener("error", (ereignis) => {
      meldeFehler(ereignis.message || "Worker", "fehler.worker");
      terminateAasWorker();
    });
    worker.addEventListener("messageerror", () => {
      meldeFehler("messageerror", "fehler.worker");
      terminateAasWorker();
    });

    api = Comlink.wrap<AasWorkerApi>(worker);
  }
  return api;
}

export function terminateAasWorker(): void {
  worker?.terminate();
  worker = null;
  api = null;
}

export type { AasWorkerApi };
export * from "./protocol.js";
