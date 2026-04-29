import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["source"],
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
