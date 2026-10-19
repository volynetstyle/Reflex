import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { commands } from "vitest/browser";
import type { CompilerReport } from "../../src/diagnostics";
import { checkSample, newCoverage, staticModule, type Compile } from "./static-tree.shared";

declare module "vitest/browser" {
  interface BrowserCommands {
    compileLowered(code: string, variant: string): Promise<{ body: string; report: CompilerReport | null }>;
  }
}

const compile: Compile = (code, variant) => commands.compileLowered(code, variant);

describe("generated static trees (browser)", () => {
  it("mount identically in every variant", async () => {
    const coverage = newCoverage();
    await fc.assert(
      fc.asyncProperty(staticModule, (code) => checkSample(code, compile, coverage)),
      { numRuns: 150 },
    );
    expect(coverage.template).toBeGreaterThan(0);
    expect(coverage.native).toBeGreaterThan(0);
  }, 300_000);
});
