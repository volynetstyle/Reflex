import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const runtimeRoot = resolve(packageRoot, "../reflex-runtime/src");

export default defineConfig({
  resolve: {
    alias: [
      { find: "@runtime", replacement: runtimeRoot },
      {
        find: "@volynets/reflex-runtime/internal",
        replacement: resolve(runtimeRoot, "internal/index.ts"),
      },
      {
        find: "@volynets/reflex-scheduler",
        replacement: resolve(packageRoot, "../reflex-scheduler/src/index.ts"),
      },
      {
        find: "@volynets/reflex/unstable",
        replacement: resolve(packageRoot, "../reflex/src/unstable/index.ts"),
      },
      {
        find: "@volynets/reflex",
        replacement: resolve(packageRoot, "../reflex/src/index.ts"),
      },
    ],
    conditions: ["source"],
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
  test: {
    environment: "node",
    isolate: false,
    pool: "forks",
    include: ["tests/**/*.test.ts"],
    coverage: { provider: "v8", include: ["src/**/*.ts"] },
    benchmark: { include: ["bench/**/*.bench.ts"] },
  },
  esbuild: { platform: "node", format: "esm", treeShaking: true },
});
