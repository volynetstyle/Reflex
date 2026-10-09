import { defineConfig } from "vitest/config";
import { configRoot } from "./tooling/configs/source-aliases";

/** Explicit projects keep research sweeps and compiler mutations opt-in. */
export default defineConfig({
  root: configRoot(import.meta.url),
  test: {
    projects: [
      "packages/reflex-runtime/vite.config.ts",
      "packages/reflex-runtime/vite.dev.config.ts",
      "packages/reflex-runtime/vite.projection.config.ts",
      "packages/reflex-scheduler/vite.config.ts",
      "packages/reflex/vite.config.ts",
      "packages/reflex-framework/vite.config.ts",
      "packages/reflex-framework/vite.lifecycle.dev.config.ts",
      "packages/reflex-store/vite.config.ts",
      "packages/reflex-store/vite.dev.config.ts",
      "packages/reflex-async/vite.config.ts",
      "packages/reflex-dom/vite.config.ts",
      "packages/reflex-dom/vite.browser.config.ts"
],
    reporters: ["default"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["packages/reflex-runtime/src/**/*.ts", "packages/reflex/src/**/*.ts", "packages/reflex-async/src/**/*.ts", "packages/reflex-dom/src/**/*.ts"],
      exclude: [
        "**/*.d.ts", "packages/reflex-runtime/src/**/index.ts",
        "packages/reflex-runtime/src/subtle.ts", "packages/reflex-runtime/src/internal/process.ts",
        "packages/reflex-runtime/src/kernel/dev.ts", "packages/reflex-runtime/src/kernel/reduction/types.ts",
        "packages/reflex-runtime/src/kernel/stages/**", "packages/reflex-runtime/src/kernel/static/types.ts",
        "packages/reflex-runtime/src/reactivity/dev.ts",
      ],
      thresholds: {
        "packages/reflex-runtime/src/**": { statements: 84, functions: 80, lines: 85 },
      },
    },
  },
});
