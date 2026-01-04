import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __DEV__: true,
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
  },
  esbuild: {
    platform: "node",
    format: "esm",
    treeShaking: true,
  },
});
