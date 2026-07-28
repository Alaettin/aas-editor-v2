import { build } from "esbuild";

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
  // Workspace-Code und AAS-SDKs werden hineingezogen. Fastify bleibt extern, weil es
  // Plugins dynamisch nachlaedt und Buendeln dort mehr kaputt macht als es spart.
  external: ["fastify", "@fastify/*"],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});

console.log("Server gebaut: dist/index.js");
