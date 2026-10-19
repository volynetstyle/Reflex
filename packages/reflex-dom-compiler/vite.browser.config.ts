import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";
import baseConfig from "./vite.config";
import { compileLowered, type Variant } from "./test/harness/compile.node";

const browsers = (process.env.REFLEX_BROWSERS ?? "chromium,firefox,webkit")
  .split(",")
  .map((name) => ({ browser: name.trim() as "chromium" | "firefox" | "webkit" }));

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    name: "dom-compiler/browser",
    include: ["test/**/*.browser.test.ts"],
    exclude: [...configDefaults.exclude],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: browsers,
      commands: {
        // Babel runs on the server; the browser only evaluates the result.
        compileLowered: (_context, code: string, variant: Variant) => compileLowered(code, variant),
      },
    },
  },
});
