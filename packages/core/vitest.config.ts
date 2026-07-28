import { defineConfig } from "vitest/config";

/**
 * Stolperfalle, siehe Plan Abschnitt 13: der ESM-Build der aas-core-SDKs importiert
 * ohne Dateiendung (`./common` statt `./common.js`). Unter nativem Node-ESM bricht das
 * mit ERR_MODULE_NOT_FOUND ab. Die Pakete duerfen deshalb nicht als externe Abhaengigkeit
 * an Node durchgereicht werden, sondern muessen durch die Vite-Pipeline laufen, die
 * endungslose Importe aufloest.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    server: {
      deps: {
        inline: [
          /@aas-core-works\/aas-core3\.[01]-typescript/,
          /aas-package3-typescript/,
          /xmlsax-typescript/,
        ],
      },
    },
  },
});
