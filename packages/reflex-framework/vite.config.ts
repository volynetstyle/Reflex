import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const reflexRoot = resolve(packageRoot, "../reflex/src");
const runtimeRoot = resolve(packageRoot, "../reflex-runtime/src");

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
        find: "@volynets/reflex",
        replacement: resolve(reflexRoot, "index.ts"),
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
    include: ["test/**/*.test.ts"],
  },
  esbuild: {
    platform: "node",
    format: "esm",
    treeShaking: true,
  },
});
