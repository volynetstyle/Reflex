import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [{
    name: "runtime-walker-test-state",
    enforce: "pre",
    transform(code, id) {
      // Expose existing lexical state only in the test transform. No runtime
      // fields, counters, callbacks, or production exports are introduced.
      if (id.replace(/\\/g, "/").endsWith("/src/kernel/stages/second/pull_iterator.ts")) {
        return code + "\nexport { stack as testPullStack, high as testPullHigh };\n";
      }
    },
  }],
  resolve: {
    alias: {
      "@runtime": fileURLToPath(new URL("./src", import.meta.url)),
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
  build: {
    lib: false,
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "test/dev/**/*.dev.test.ts"],
    isolate: false,
    pool: "forks",
    coverage: {
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/index.ts",
        "src/subtle.ts",
        "debug/**",
        "debug/debug.types.ts",
        "debug/dev_flag.ts",
        "src/internal/process.ts",
        "src/kernel/dev.ts",
        "src/kernel/reduction/types.ts",
        "src/kernel/stages/**",
        "src/kernel/static/types.ts",
        "src/reactivity/dev.ts",
      ],
      thresholds: {
        statements: 84,
        functions: 80,
        lines: 85,
      },
    },
  },
  esbuild: {
    platform: "node",
    format: "esm",
    treeShaking: true,
  },
});
