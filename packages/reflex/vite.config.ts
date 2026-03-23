import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __DEV__: false,
    __TEST__: true,
    __PROD__: false,
  },
  build: {
    lib: false, 
  },
 test: {
    environment: "node",
    isolate: false,         
    pool: "forks",
    coverage: {
      provider: "v8",
      include: ["packages/reflex/src/**/*.ts"],
      exclude: ["packages/reflex/src/globals.d.ts"],
    },
  },
  esbuild: {
    platform: "node",
    format: "esm",
    treeShaking: true,
  },
});
