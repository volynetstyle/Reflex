import { defineConfig } from "vitest/config";

export default defineConfig({
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
    environment: "node",
    pool: "forks",
    isolate: true,
    exclude: ["dist/**", "node_modules/**"],
  },
});
