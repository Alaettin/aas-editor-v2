import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "test-data/**",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },

  // Plan Abschnitt 3: packages/core ist DOM-frei, React-frei und Node-frei,
  // damit es im Worker, im Browser und im Backend laeuft. Diese Regel haelt das durch.
  {
    files: ["packages/core/**/*.ts"],
    languageOptions: {
      globals: {}, // weder Browser- noch Node-Globals
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "packages/core muss DOM- und React-frei bleiben." },
            { name: "react-dom", message: "packages/core muss DOM- und React-frei bleiben." },
            { name: "fs", message: "packages/core muss ohne Node-only-Module auskommen." },
            { name: "path", message: "packages/core muss ohne Node-only-Module auskommen." },
            { name: "crypto", message: "packages/core muss ohne Node-only-Module auskommen." },
            // Nur der Wurzelimport ist verboten, er zieht alle Module herein. Die
            // Subpath-Exports sind ausdruecklich erwuenscht.
            {
              name: "@aas-core-works/aas-core3.1-typescript",
              message:
                "Wurzelimport der SDK sprengt das Bundle-Budget. Subpath-Export nutzen, z. B. .../types.",
            },
            {
              name: "@aas-core-works/aas-core3.0-typescript",
              message:
                "Wurzelimport der SDK sprengt das Bundle-Budget. Subpath-Export nutzen, z. B. .../jsonization.",
            },
          ],
          patterns: [
            {
              group: ["node:*"],
              message: "packages/core muss ohne Node-only-Module auskommen.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "document", message: "packages/core laeuft im Worker, kein DOM." },
        { name: "window", message: "packages/core laeuft im Worker, kein DOM." },
        { name: "localStorage", message: "packages/core laeuft im Worker, kein DOM." },
        { name: "sessionStorage", message: "packages/core laeuft im Worker, kein DOM." },
        { name: "process", message: "packages/core laeuft im Browser, kein Node." },
        { name: "__dirname", message: "packages/core laeuft im Browser, kein Node." },
      ],
    },
  },
  // Tests in core duerfen Node nutzen, sie laufen unter Vitest.
  {
    files: ["packages/core/test/**/*.ts", "packages/core/**/*.config.ts"],
    languageOptions: { globals: globals.node },
    rules: { "no-restricted-imports": "off", "no-restricted-globals": "off" },
  },

  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
  },
  {
    files: ["apps/server/**/*.{ts,mjs}", "scripts/**/*.mjs", "*.config.{js,ts,mjs}"],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
