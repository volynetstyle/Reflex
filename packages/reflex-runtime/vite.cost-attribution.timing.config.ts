import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Timing leg of the cost-attribution sweep (see test/perf/cost-attribution/).
// __PROFILE__: false — a real non-profile build, not just profiling disabled
// at runtime — so profileRuntimeCounter's guard branch is compiled out of
// every hot-path call site rather than merely skipped.
export default defineConfig({
  resolve: {
    alias: {
      "@runtime": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  define: {
    __DEV__: false,
    __PROFILE__: false,
    __TRACKING_ONE_HOP__: true,
    __TRACKING_TWO_HOP__: true,
    __TRACKING_LAST_EDGE__: true,
    __TEST__: true,
    __PROD__: false,
  },
  build: {
    lib: false,
  },
  test: {
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
