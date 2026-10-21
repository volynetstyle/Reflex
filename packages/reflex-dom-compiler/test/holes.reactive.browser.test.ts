import { commands } from "vitest/browser";
import type { CompilerReport } from "../src/diagnostics";
import { reactiveHoleSuite, SOURCE } from "./holes.reactive.shared";

declare module "vitest/browser" {
  interface BrowserCommands {
    compileLowered(code: string, variant: string): Promise<{ body: string; report: CompilerReport | null }>;
  }
}

// Babel runs on the server; compile every variant once, up front.
const compiled = Object.fromEntries(
  await Promise.all(
    (["baseline", "native", "template"] as const).map(async (variant) => [
      variant,
      await commands.compileLowered(SOURCE, variant),
    ]),
  ),
);

reactiveHoleSuite((code, variant) => {
  if (code !== SOURCE) throw new Error("unexpected source");
  return compiled[variant]!;
}, "browser");
