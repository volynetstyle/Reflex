import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const runtimeRoot = resolve(__dirname, "../reflex-runtime/src");

export default defineConfig({
  resolve: {
    alias: {
      "@runtime": runtimeRoot,
      "@volynets/reflex-runtime/internal": resolve(
        runtimeRoot,
        "internal/index.ts",
      ),
      "@volynets/reflex-runtime": resolve(runtimeRoot, "index.ts"),
    },
  },
  define: {
    __DEV__: false,
    __PROFILE__: false,
    __TRACKING_ONE_HOP__: true,
    __TRACKING_TWO_HOP__: true,
    __TRACKING_LAST_EDGE__: true,
    __TEST__: true,
    __PROD__: false,
  },
  test: { environment: "node", isolate: false },
});
