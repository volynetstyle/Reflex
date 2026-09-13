import { describe, expect, it } from "vitest";
import { enumerateBoundedPrograms } from "./bounded-exhaustive";
import { holdoutSemanticMutants } from "./holdout-mutants";
import { mutationQualificationCorpus } from "./mutation-corpus";
import {
  formatMutationReport,
  qualifyMutationCorpus,
} from "./mutation-qualification";
import {
  defaultRecoveryLanguage,
  enumerateRecoveryPrograms,
  exploreRecoveryDifferential,
} from "./recovery-exhaustive";

describe("failure recovery differential exploration", () => {
  const programs = enumerateRecoveryPrograms();

  it("records active divergences across the recovery language", () => {
    const report = exploreRecoveryDifferential(programs);

    expect(report.language).toEqual(defaultRecoveryLanguage);
    expect(programs).toHaveLength(18_660);
    expect(report.canonicalPrograms).toBe(programs.length);
    expect(report.executedPrograms).toBe(programs.length);
    expect(report.divergences).toBe(8);
    expect(report.firstDivergence).toMatchObject({
      operationIndex: 8,
      operation: { type: "flush" },
      expected: {
        error: { name: "Error", message: "bounded failure" },
        effects: [],
      },
      actual: {
        error: { name: "Error", message: "bounded failure" },
        effects: [{ effect: "watcher", phase: "cleanup", value: true }],
      },
    });
  });

  it("propagates infected failure state to observable behavior", () => {
    const report = qualifyMutationCorpus(
      [
        ...mutationQualificationCorpus,
        ...enumerateBoundedPrograms(),
        ...programs,
      ],
      holdoutSemanticMutants,
    );

    expect(report.killed, formatMutationReport(report)).toBe(6);
    expect(report.survived, formatMutationReport(report)).toBe(0);
    expect(
      report.results.find(
        (result) => result.id === "failed-computed-increments-version",
      ),
    ).toMatchObject({
      status: "killed",
      reached: true,
      infected: true,
    });
  });
});
