import { defineConfig } from "vitest/config";

import base from "./vite.config";

export default defineConfig({
  ...base,
  define: { ...base.define, __PROFILE__: false },
  test: {
    ...base.test,
    include: ["bench/effect-fanout-attribution/timing.test.ts"],
    testTimeout: 120_000,
  },
});
