import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compileLowered } from "../harness/compile.node";
import { checkSample, FUZZ_RUNS, newCoverage, staticModule } from "./static-tree.shared";

describe("generated static trees (jsdom)", () => {
  it("mount identically in every variant", async () => {
    const coverage = newCoverage();
    // On failure fast-check prints the shrunk module source, the seed and the
    // path; replay with `fc.assert(..., { seed, path })`.
    await fc.assert(
      fc.asyncProperty(staticModule, (code) => checkSample(code, compileLowered, coverage)),
      { numRuns: FUZZ_RUNS || 300 },
    );
    // The generator must keep exercising every strategy.
    expect(coverage.template).toBeGreaterThan(0);
    expect(coverage.native).toBeGreaterThan(0);
    expect(coverage.runtime).toBeGreaterThan(0);
  }, 120_000);
});
