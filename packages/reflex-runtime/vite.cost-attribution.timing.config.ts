import { runtimeFlags } from "../../tooling/configs/runtime-flags";
import { sourceAliases, configRoot } from "../../tooling/configs/source-aliases";
import { defineConfig } from "vitest/config";

// Timing leg of the cost-attribution sweep (see test/perf/cost-attribution/).
// __PROFILE__: false — a real non-profile build, not just profiling disabled
// at runtime — so profileRuntimeCounter's guard branch is compiled out of
// every hot-path call site rather than merely skipped.
export default defineConfig({
  root: configRoot(import.meta.url),
  resolve: {
    alias: sourceAliases("runtime"),
  },
  define: runtimeFlags("source-test"),
  build: {
    lib: false,
  },
  test: {
    name: "runtime/cost-attribution-timing",
    environment: "node",
    include: ["test/perf/cost-attribution/timing.sweep.ts"],
    isolate: false,
    pool: "forks",
    testTimeout: 300_000,
  },
  esbuild: {
    platform: "node",
    format: "esm",
    treeShaking: true,
  },
});
