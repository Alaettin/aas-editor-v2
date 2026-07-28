import * as Comlink from "comlink";

import type { AasWorkerApi } from "./protocol.js";

/**
 * Zugang zum AAS-Worker. Der Worker wird erst beim ersten Zugriff gestartet, damit
 * das Startbundle nicht auf ihn wartet.
 */

let worker: Worker | null = null;
let api: Comlink.Remote<AasWorkerApi> | null = null;

export function aasWorker(): Comlink.Remote<AasWorkerApi> {
  if (!api) {
    worker = new Worker(new URL("./aas.worker.ts", import.meta.url), { type: "module" });
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
