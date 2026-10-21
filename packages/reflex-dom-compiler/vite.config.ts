import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import { runtimeFlags } from "../../tooling/configs/runtime-flags";
import { configRoot, sourceAliases } from "../../tooling/configs/source-aliases";
import { reflexVariantPlugin } from "./test/harness/vite-plugin";

export default defineConfig({
  root: configRoot(import.meta.url),
  plugins: [reflexVariantPlugin()],
  resolve: {
    alias: [
      ...sourceAliases("dom"),
      {
        find: "@volynets/reflex-dom-compiler/runtime",
        replacement: fileURLToPath(new URL("./src/runtime.ts", import.meta.url)),
      },
    ],
    conditions: ["source"],
  },
  define: runtimeFlags("source-test"),
  test: {
    name: "dom-compiler/jsdom",
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "test/**/*.browser.test.ts"],
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "@volynets/reflex-dom",
  },
});
