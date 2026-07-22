import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const runtimeRoot = resolve(packageRoot, "../reflex-runtime/src");
const schedulerRoot = resolve(packageRoot, "../reflex-scheduler/src");

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@runtime",
        replacement: runtimeRoot,
      },
      {
        find: "@volynets/reflex-runtime/internal",
        replacement: resolve(runtimeRoot, "internal/index.ts"),
      },
      {
        find: "@volynets/reflex-runtime",
        replacement: resolve(runtimeRoot, "index.ts"),
      },
      {
        find: "@volynets/reflex-scheduler",
        replacement: resolve(schedulerRoot, "index.ts"),
      },
    ],
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
    include: ["tests/**/*.test.ts"],
    isolate: false,
    pool: "forks",
  },
  esbuild: {
    platform: "node",
    format: "esm",
    treeShaking: true,
  },
});
