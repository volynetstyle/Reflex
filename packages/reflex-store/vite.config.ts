import { runtimeFlags } from "../../tooling/configs/runtime-flags";
import { sourceAliases, configRoot } from "../../tooling/configs/source-aliases";
import { defineConfig } from "vitest/config";
import reflexStore from "./src/vite";


export default defineConfig({
  root: configRoot(import.meta.url),
  plugins: [reflexStore()],
  resolve: {
    alias: sourceAliases("store"),
  },
  define: runtimeFlags("source-test"),
  test: {
    name: "store/source",
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/semantic-workloads.metrics.test.ts"],
    isolate: true,
    pool: "forks",
  },
  esbuild: {
    platform: "node",
    format: "esm",
    treeShaking: true,
  },
});
