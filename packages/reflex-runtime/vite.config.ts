import { runtimeFlags } from "../../tooling/configs/runtime-flags";
import { sourceAliases, configRoot } from "../../tooling/configs/source-aliases";
import { defineConfig } from "vitest/config";
import { mutantPlugin } from "./testkit/lib/mutation.mjs";

export default defineConfig({
  root: configRoot(import.meta.url),
  plugins: [
    // `pnpm rt audit` only: applies REFLEX_MUTATIONS, a no-op otherwise.
    mutantPlugin(),
    {
      name: "runtime-walker-test-state",
      enforce: "pre",
      transform(code, id) {
        // Expose existing lexical state only in the test transform. No runtime
        // fields, counters, callbacks, or production exports are introduced.
        const normalizedId = id.replace(/\\/g, "/");
        if (normalizedId.endsWith("/src/kernel/stages/stabilization/pull_iterator.ts")) {
          return (
            code +
            "\nexport { stack as testPullStack, high as testPullHigh };\n"
          );
        }
        if (normalizedId.endsWith("/src/kernel/stages/stabilization/pull_dependency.ts")) {
          return code + "\nexport { testPullStack, testPullHigh } from './pull_iterator';\n";
        }
      },
    },
  ],
  resolve: {
    alias: sourceAliases("runtime"),
  },
  define: runtimeFlags("source-test"),
  build: {
    lib: false,
  },
  test: {
    name: "runtime/source",
    environment: "node",
    exclude: [
      "**/node_modules/**",
      "test/dev/**/*.dev.test.ts",
      "test/projection/**/*.test.ts",
      // Pinned behavior outside the contract: vite.characterization.config.ts.
      "test/characterization/**",
    ],
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
