import { runtimeFlags } from "../../tooling/configs/runtime-flags";
import { sourceAliases, configRoot } from "../../tooling/configs/source-aliases";
import { defineConfig } from "vitest/config";


export default defineConfig({
  root: configRoot(import.meta.url),
  resolve: {
    alias: sourceAliases("scheduler"),
  },
  define: runtimeFlags("source-test"),
  test: {
    name: "scheduler/source", environment: "node", isolate: false },
});
