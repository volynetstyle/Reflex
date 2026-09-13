import { describe, expect, it } from "vitest";
import {
  defaultBoundedLanguage,
  enumerateBoundedPrograms,
  verifyBoundedEquivalence,
} from "./bounded-exhaustive";
import { holdoutSemanticMutants } from "./holdout-mutants";
import { mutationQualificationCorpus } from "./mutation-corpus";
import {
  formatMutationReport,
  qualifyMutationCorpus,
} from "./mutation-qualification";

describe("bounded exhaustive differential exploration", () => {
  const programs = enumerateBoundedPrograms();

  it("checks every canonical program in the bounded language", () => {
    const report = verifyBoundedEquivalence(programs);

    expect(report.language).toEqual(defaultBoundedLanguage);
    expect(programs).toHaveLength(27_061);
    expect(report.canonicalPrograms).toBe(programs.length);
    expect(report.executedPrograms).toBe(programs.length);
    expect(report.executedOperations).toBe(154_011);
    expect(report.divergences).toBe(0);
  });

  it("improves holdout evidence without survivor-specific fixtures", () => {
    const report = qualifyMutationCorpus(
      [...mutationQualificationCorpus, ...programs],
      holdoutSemanticMutants,
    );

    expect(report.killed, formatMutationReport(report)).toBe(5);
    expect(report.survived).toBe(1);
    expect(
      report.results.find((result) => result.status === "survived"),
    ).toMatchObject({
      id: "failed-computed-increments-version",
      reached: true,
      infected: true,
    });
  });
});
