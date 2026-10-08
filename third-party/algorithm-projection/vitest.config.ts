import { defineConfig } from "vitest/config";
import { configRoot } from "../../tooling/configs/source-aliases";

// Keep this tool suite local; do not inherit the product root projects.
export default defineConfig({
  root: configRoot(import.meta.url),
  test: { name: "algorithm-projection", environment: "node" },
});
