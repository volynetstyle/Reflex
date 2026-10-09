import { runtimeFlags } from "../../tooling/configs/runtime-flags";
import { sourceAliases, configRoot } from "../../tooling/configs/source-aliases";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: configRoot(import.meta.url),
  resolve: {
    alias: sourceAliases("runtime"),
  },
  define: runtimeFlags("dev-test"),
  build: {
    lib: false,
  },
  test: {
    name: "runtime/dev",
    environment: "node",
    include: ["test/dev/**/*.dev.test.ts"],
    isolate: false,
    pool: "forks",
  },
  esbuild: {
    platform: "node",
    format: "esm",
    treeShaking: true,
  },
});
