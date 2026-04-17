import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["source"],
    alias: [
      {
        find: "@volynets/reflex",
        replacement: fileURLToPath(
          new URL("../reflex/src/index.ts", import.meta.url),
        ),
      },
      {
        find: "@volynets/reflex-framework/ownership/reflex",
        replacement: fileURLToPath(
          new URL("../reflex-framework/src/ownership/reflex.ts", import.meta.url),
        ),
      },
      {
        find: "@volynets/reflex-framework/ownership",
        replacement: fileURLToPath(
          new URL("../reflex-framework/src/ownership/index.ts", import.meta.url),
        ),
      },
      {
        find: "@volynets/reflex-framework/jsx-runtime",
        replacement: fileURLToPath(
          new URL("../reflex-framework/src/jsx-runtime.ts", import.meta.url),
        ),
      },
      {
        find: "@volynets/reflex-framework/jsx-dev-runtime",
        replacement: fileURLToPath(
          new URL("../reflex-framework/src/jsx-dev-runtime.ts", import.meta.url),
        ),
      },
      {
        find: "@volynets/reflex-framework",
        replacement: fileURLToPath(
          new URL("../reflex-framework/src/index.ts", import.meta.url),
        ),
      },
    ],
  },
  define: {
    __DEV__: false,
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
  },
});
