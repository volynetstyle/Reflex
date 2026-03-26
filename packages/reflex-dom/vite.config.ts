import { defineConfig } from "vitest/config";

export default defineConfig({
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
