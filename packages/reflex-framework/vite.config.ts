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
    ],
  },
  define: {
    __DEV__: false,
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
