import { runtimeFlags } from "../../tooling/configs/runtime-flags";
import { sourceAliases, configRoot } from "../../tooling/configs/source-aliases";
import { defineConfig } from "vitest/config";


export default defineConfig({
  root: configRoot(import.meta.url),
  resolve: {
    alias: sourceAliases("async"),
    conditions: ["source"],
  },
  define: runtimeFlags("source-test"),
  test: {
    name: "async/source",
    environment: "node",
    isolate: false,
    pool: "forks",
    include: ["tests/**/*.test.ts"],
    coverage: { provider: "v8", include: ["src/**/*.ts"] },
    benchmark: { include: ["bench/**/*.bench.ts"] },
  },
  esbuild: { platform: "node", format: "esm", treeShaking: true },
});
