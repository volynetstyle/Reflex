import { runtimeFlags } from "../../tooling/configs/runtime-flags";
import { sourceAliases, configRoot } from "../../tooling/configs/source-aliases";
import { defineConfig } from "vitest/config";

// Structural leg of the cost-attribution sweep (see
// test/perf/cost-attribution/). __PROFILE__: true so profileRuntime()
// captures real counters/topology. A dedicated config (rather than reusing
// vite.dev.config.ts's restrictive test.include) is needed because vitest's
// `run` command intersects the CLI file filter with `test.include` instead
// of overriding it.
export default defineConfig({
  root: configRoot(import.meta.url),
  resolve: {
    alias: sourceAliases("runtime"),
  },
  define: runtimeFlags("profile-test"),
  build: {
    lib: false,
  },
  test: {
    name: "runtime/cost-attribution-structural",
    environment: "node",
    include: ["test/perf/cost-attribution/structural.sweep.ts"],
    isolate: false,
    pool: "forks",
    testTimeout: 120_000,
  },
  esbuild: {
    platform: "node",
    format: "esm",
    treeShaking: true,
  },
});
