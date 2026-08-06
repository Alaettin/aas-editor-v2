import { readFileSync } from "node:fs";
import { build } from "esbuild";

const { version } = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));

/**
 * Der Server wird gebuendelt statt nur transpiliert, weil er `@aas-editor/core`
 * als TypeScript-Quelle aus dem Workspace einbindet. Ausserdem umgeht das Buendeln
 * die Stolperfalle aus Plan Abschnitt 13: der ESM-Build der aas-core-SDKs importiert
 * endungslos und ist unter nativem Node-ESM nicht ladbar. esbuild loest das auf.
 */
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: "dist/index.js",
  sourcemap: true,
  // Eine Wahrheit fuer die Fassung: die package.json dieses Pakets.
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Workspace-Code und AAS-SDKs werden hineingezogen. Fastify bleibt extern, weil es
  // Plugins dynamisch nachlaedt und Buendeln dort mehr kaputt macht als es spart.
  //
  // `better-sqlite3` **muss** extern bleiben. Es ist ein natives Modul und sucht seine
  // .node-Datei ueber `__dirname` relativ zu seinem eigenen Ort. Gebuendelt zeigt dieser
  // Ort ins Leere, und Node bricht beim Start mit ERR_AMBIGUOUS_MODULE_SYNTAX ab, weil im
  // selben Modul dann `require()` und ein Top-Level-await stehen. Im Entwicklungsbetrieb
  // faellt das nie auf, dort laeuft der Server ueber tsx: gefunden hat es erst der erste
  // echte Containerlauf am 06.08.2026.
  external: ["fastify", "@fastify/*", "better-sqlite3"],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});

console.log("Server gebaut: dist/index.js");
