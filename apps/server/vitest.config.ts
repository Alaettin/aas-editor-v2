import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Die Tests legen echte SQLite-Dateien an und raeumen sie wieder weg. Parallel laufende
    // Dateien wuerden sich dabei nicht stoeren, aber besser eine Datei nach der anderen.
    fileParallelism: false,
    server: {
      deps: {
        /*
         * Der ESM-Build der aas-core-SDKs importiert ohne Dateiendung und ist unter
         * nativem Node-ESM nicht ladbar. Im Produktionsbau loest `build.mjs` das durch
         * das Buendeln auf, im Vitest-Lauf muss Vite die Pakete dafuer inline ziehen.
         * Gebraucht wird das, seit der Server die Befunde eines Projekts zaehlt.
         */
        inline: [/@aas-core-works/],
      },
    },
  },
});
