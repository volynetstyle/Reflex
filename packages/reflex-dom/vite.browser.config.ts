import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import baseConfig from "./vite.config";

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ["test/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      headless: true,
      screenshotFailures: false,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
