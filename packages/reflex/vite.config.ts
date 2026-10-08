import { runtimeFlags } from "../../tooling/configs/runtime-flags";
import { sourceAliases, configRoot } from "../../tooling/configs/source-aliases";
import { defineConfig } from "vitest/config";


export default defineConfig({
  root: configRoot(import.meta.url),
  resolve: {
    alias: sourceAliases("reflex"),
  },
  define: runtimeFlags("source-test"),
  build: {
    lib: false,
  },
  test: {
    name: "reflex/source",
    environment: "node",
    isolate: false,
    pool: "forks",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/reflex/src/**/*.ts"],
      exclude: ["packages/reflex/src/globals.d.ts"],
    },
  },
  esbuild: {
    platform: "node",
    format: "esm",
    treeShaking: true,
  },
});
