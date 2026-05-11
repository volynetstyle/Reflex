import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __DEV__: false,
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
