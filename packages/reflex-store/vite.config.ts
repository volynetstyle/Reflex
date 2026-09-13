import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import reflexStore from "./src/vite";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const reflexRoot = resolve(packageRoot, "../reflex/src");
const runtimeRoot = resolve(packageRoot, "../reflex-runtime/src");
const schedulerRoot = resolve(packageRoot, "../reflex-scheduler/src");

export default defineConfig({
  plugins: [reflexStore()],
  resolve: {
    alias: [
      {
        find: /^@volynets\/reflex$/,
        replacement: resolve(reflexRoot, "index.ts"),
      },
      {
        find: /^@volynets\/reflex-store$/,
        replacement: resolve(packageRoot, "src/index.ts"),
      },
      {
        find: "@runtime",
        replacement: runtimeRoot,
      },
      {
        find: "@volynets/reflex-runtime/debug",
        replacement: resolve(runtimeRoot, "debug.ts"),
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
    exclude: ["tests/semantic-workloads.metrics.test.ts"],
    isolate: true,
    pool: "forks",
  },
  esbuild: {
    platform: "node",
    format: "esm",
    treeShaking: true,
  },
});
