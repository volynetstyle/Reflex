import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@runtime": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  define: {
    __DEV__: true,
    __PROFILE__: true,
    __TRACKING_ONE_HOP__: true,
    __TRACKING_TWO_HOP__: true,
    __TRACKING_LAST_EDGE__: true,
    __TEST__: true,
    __PROD__: false,
  },
  test: {
    include: ["test/projection/**/*.test.ts"],
    environment: "node",
    isolate: true,
    pool: "forks",
  },
});
