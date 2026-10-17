import { resolve } from "node:path";
import { runtimeFlags } from "../../tooling/configs/runtime-flags";
import { sourceAliases, configRoot } from "../../tooling/configs/source-aliases";
import { defineConfig } from "vitest/config";

// Long-lived lifetime experiments (see test/perf/lifetime-churn/). The
// managed leg imports reflex-framework ownership from source, so the runtime
// aliases must resolve every runtime entry to the same source modules the
// harness imports directly. __PROFILE__: true for structural counters;
// --expose-gc for retention and heap measurements.
export default defineConfig({
  root: configRoot(import.meta.url),
  resolve: {
    alias: [
      ...sourceAliases("framework"),
      {
        find: "@volynets/reflex-framework",
        replacement: resolve(
          configRoot(import.meta.url),
          "../reflex-framework/src/index.ts",
        ),
      },
    ],
  },
  define: runtimeFlags("profile-test"),
  build: {
    lib: false,
  },
  test: {
    name: "runtime/lifetime-churn",
    environment: "node",
    include: ["test/perf/lifetime-churn/lifetime-churn.sweep.ts"],
    isolate: false,
    pool: "forks",
    execArgv: ["--expose-gc"],
    testTimeout: 1_800_000,
  },
  esbuild: {
    platform: "node",
    format: "esm",
    treeShaking: true,
  },
});
