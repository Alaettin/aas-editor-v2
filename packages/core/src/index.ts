/**
 * @aas-editor/core
 *
 * Domaenenlogik des Editors: normalisiertes Modell, Adapter zu den aas-core-SDKs,
 * Upgrade 3.0 nach 3.1, Import und Export.
 *
 * Harte Regel, per ESLint erzwungen: kein DOM, kein React, keine Node-only-Module.
 * Dieses Paket laeuft im Web Worker, im Browser und im Backend.
 *
 * Achtung beim Importieren: `model/aasCore.js` und alles unter `io/` ziehen die SDK
 * herein und gehoeren in den Worker. Der Hauptthread nimmt nur die Module, die hier
 * ohne SDK-Abhaengigkeit stehen.
 */

export const METAMODEL_VERSION = "3.1" as const;

export * from "./model/json.js";
export * from "./model/kinds.js";
export * from "./model/store.js";
export * from "./model/normalize.js";
export * from "./model/paths.js";
export * from "./model/history.js";
export * from "./model/operations.js";
export * from "./model/clipboard.js";
export * from "./search.js";
export * from "./semantics.js";
export * from "./schema/enums.js";
export * from "./schema/fields.js";
export * from "./schema/elements.js";
export * from "./identifiers.js";
export * from "./upgrade/v30ToV31.js";
