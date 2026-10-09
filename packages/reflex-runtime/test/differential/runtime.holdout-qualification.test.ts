import { describe, expect, it } from "vitest";
import { holdoutSemanticMutants } from "./holdout-mutants";
import { mutationQualificationCorpus } from "./mutant/mutation-corpus";
import {
  formatMutationReport,
  qualifyMutationCorpus,
} from "./mutant/mutation-qualification";

describe("differential oracle holdout qualification", () => {
  it("measures an untuned cohort without requiring a perfect score", () => {
    const report = qualifyMutationCorpus(
      mutationQualificationCorpus,
      holdoutSemanticMutants,
    );

    expect(report.total).toBe(holdoutSemanticMutants.length);
    expect(report.killed, formatMutationReport(report)).toBe(4);
    expect(report.survived, formatMutationReport(report)).toBe(2);
    expect(
      report.results
        .filter((result) => result.status === "survived")
        .map((result) => [result.id, result.reached, result.infected]),
    ).toEqual([
      ["watcher-dispose-skips-cleanup", false, false],
      ["failed-computed-increments-version", true, true],
    ]);

    for (const result of report.results) {
      if (result.status === "killed") {
        expect(result.reached, result.id).toBe(true);
        expect(result.infected, result.id).toBe(true);
        expect(result.witness, result.id).toBeDefined();
      }
    }
  });
});
