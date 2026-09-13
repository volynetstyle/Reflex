import { defineConfig } from "vitest/config";
import base from "./vite.config";

export default defineConfig({
  ...base,
  define: { ...base.define, __PROFILE__: true },
  test: {
    ...base.test,
    include: ["tests/semantic-workloads.metrics.test.ts"],
    exclude: [],
  },
});
