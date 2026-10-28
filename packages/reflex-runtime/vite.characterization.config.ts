import base from "./vite.config";
import { defineConfig } from "vitest/config";

// Characterization of regions the contract leaves open (F1, watcher disposal
// from a host hook). The files pin what the runtime does today so that a
// change is a visible decision; they are not a correctness verdict, and the
// testkit reports their failure as `changed` (layer `characterization`).
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    name: "runtime/characterization",
    include: ["test/characterization/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
  },
});
