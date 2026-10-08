import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";
import baseConfig from "./vite.config";

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    name: "dom/chromium",
    include: ["test/**/*.browser.test.ts"],
    exclude: [...configDefaults.exclude],
    browser: {
      enabled: true,
      headless: true,
      screenshotFailures: Boolean(process.env.CI),
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
