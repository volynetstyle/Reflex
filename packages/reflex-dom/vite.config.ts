import { runtimeFlags } from "../../tooling/configs/runtime-flags";
import { sourceAliases, configRoot } from "../../tooling/configs/source-aliases";
import { configDefaults, defineConfig } from "vitest/config";


export default defineConfig({
  root: configRoot(import.meta.url),
  resolve: {
    alias: sourceAliases("dom"),
    conditions: ["source"],
  },
  define: runtimeFlags("source-test"),
  test: {
    name: "dom/jsdom",
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "test/**/*.browser.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
    },
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "../src",
  },
});
