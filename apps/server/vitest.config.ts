import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Die Tests legen echte SQLite-Dateien an und raeumen sie wieder weg. Parallel laufende
    // Dateien wuerden sich dabei nicht stoeren, aber besser eine Datei nach der anderen.
    fileParallelism: false,
  },
});
