import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __DEV__: true,
    __TEST__: true,
    __PROD__: false,
  },
  test: {
    globals: true,
    environment: "node",
    isolate: true,
  },
});
