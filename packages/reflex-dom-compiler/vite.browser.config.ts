import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";
import baseConfig from "./vite.config";
import { compileLowered, type Variant } from "./test/harness/compile.node";

type Engine = "chromium" | "firefox" | "webkit";

/** Browser tests in the given engines. CI installs Chromium only. */
export function browserConfig(engines: readonly Engine[]) {
  return defineConfig({
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
        instances: engines.map((browser) => ({ browser })),
        commands: {
          // Babel runs on the server; the browser only evaluates the result.
          compileLowered: (_context, code: string, variant: Variant) => compileLowered(code, variant),
        },
      },
    },
  });
}

export default browserConfig(["chromium"]);
