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
    exclude: ["test/dev/**/*.dev.test.ts"],
    isolate: false,
    pool: "forks",
    coverage: {
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/index.ts",
        "src/debug/debug.types.ts",
        "src/debug/dev_flag.ts",
        "src/internal/process.ts",
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
