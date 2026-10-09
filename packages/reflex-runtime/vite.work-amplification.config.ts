import { runtimeFlags } from "../../tooling/configs/runtime-flags";
import { sourceAliases, configRoot } from "../../tooling/configs/source-aliases";
import { defineConfig } from "vitest/config";

// Work-amplification sweep (see test/perf/work-amplification/). __PROFILE__:
// true so profileRuntime() captures real counters/topology; semantic delta
// itself is measured through the public API and doesn't need __PROFILE__,
// but sharing this build with the structural counters keeps everything in
// one pass. See vite.cost-attribution.structural.config.ts for why a
// dedicated config (rather than reusing vite.dev.config.ts's restrictive
// test.include) is needed.
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
    name: "runtime/work-amplification",
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
