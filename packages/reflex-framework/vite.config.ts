import { runtimeFlags } from "../../tooling/configs/runtime-flags";
import { sourceAliases, configRoot } from "../../tooling/configs/source-aliases";
import { defineConfig } from "vitest/config";


export default defineConfig({
  root: configRoot(import.meta.url),
  resolve: {
    alias: sourceAliases("framework"),
    conditions: ["source"],
  },
  define: runtimeFlags("source-test"),
  test: {
    name: "framework/source",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
  esbuild: {
    platform: "node",
    format: "esm",
    treeShaking: true,
  },
});
