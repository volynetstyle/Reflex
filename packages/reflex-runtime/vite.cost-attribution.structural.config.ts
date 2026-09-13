import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Structural leg of the cost-attribution sweep (see
// test/perf/cost-attribution/). __PROFILE__: true so profileRuntime()
// captures real counters/topology. A dedicated config (rather than reusing
// vite.dev.config.ts's restrictive test.include) is needed because vitest's
// `run` command intersects the CLI file filter with `test.include` instead
// of overriding it.
export default defineConfig({
  resolve: {
    alias: {
      "@runtime": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  define: {
    __DEV__: false,
    __PROFILE__: true,
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
