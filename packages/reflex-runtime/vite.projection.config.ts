import { runtimeFlags } from "../../tooling/configs/runtime-flags";
import { sourceAliases, configRoot } from "../../tooling/configs/source-aliases";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: configRoot(import.meta.url),
  resolve: {
    alias: sourceAliases("runtime"),
  },
  define: runtimeFlags("dev-test"),
  test: {
    name: "runtime/projection",
    include: ["test/projection/**/*.test.ts"],
    environment: "node",
    isolate: true,
    pool: "forks",
  },
});
