import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  // vitest erbt `define` nicht aus vite.config.ts. Ohne diese Zeile waere der Tag, an dem
  // jemand jsdom einfuehrt, ein ReferenceError.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Die aas-core-SDKs importieren endungslos und sind unter nativem Node-ESM nicht
    // ladbar, siehe packages/core/vitest.config.ts.
    server: {
      deps: {
        inline: [/@aas-core-works\/aas-core3\.[01]-typescript/, /xmlsax-typescript/],
      },
    },
  },
});
