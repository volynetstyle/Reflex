import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Work-amplification sweep (see test/perf/work-amplification/). __PROFILE__:
// true so profileRuntime() captures real counters/topology; semantic delta
// itself is measured through the public API and doesn't need __PROFILE__,
// but sharing this build with the structural counters keeps everything in
// one pass. See vite.cost-attribution.structural.config.ts for why a
// dedicated config (rather than reusing vite.dev.config.ts's restrictive
// test.include) is needed.
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
    include: ["test/perf/work-amplification/amplification.sweep.ts"],
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
