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
  },
  test: {
    include: ["test/projection/**/*.test.ts"],
    environment: "node",
    isolate: true,
    pool: "forks",
  },
});
