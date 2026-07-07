import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const frameworkRoot = resolve(packageRoot, "../reflex-framework/src");
const reflexRoot = resolve(packageRoot, "../reflex/src");
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
        find: "@volynets/reflex-runtime",
        replacement: resolve(runtimeRoot, "index.ts"),
      },
      {
        find: "@volynets/reflex-framework/jsx-dev-runtime",
        replacement: resolve(frameworkRoot, "jsx-dev-runtime.ts"),
      },
      {
        find: "@volynets/reflex-framework/jsx-runtime",
        replacement: resolve(frameworkRoot, "jsx-runtime.ts"),
      },
      {
        find: "@volynets/reflex-framework",
        replacement: resolve(frameworkRoot, "index.ts"),
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
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
    },
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "../src",
  },
});
