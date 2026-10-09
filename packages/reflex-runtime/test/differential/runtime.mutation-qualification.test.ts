import { describe, expect, it } from "vitest";
import { SpecMachine, observationsEqual } from "./harness";
import { mutationQualificationCorpus } from "./mutant/mutation-corpus";
import {
  formatMutationReport,
  qualifyMutationCorpus,
} from "./mutant/mutation-qualification";
import { MutantRuntime, semanticMutants } from "./mutant/mutant-runtime";

describe("differential oracle mutation qualification", () => {
  it("keeps the inactive mutation host equivalent to SpecRuntime", () => {
    for (const candidate of mutationQualificationCorpus) {
      const oracle = new SpecMachine();
      const inactiveHost = new SpecMachine(new MutantRuntime());

      for (const operation of candidate.program) {
        expect(
          observationsEqual(
            inactiveHost.execute(operation),
            oracle.execute(operation),
          ),
          candidate.name,
        ).toBe(true);
      }
    }
  });
  it("kills every seeded non-equivalent semantic mutant", () => {
    const report = qualifyMutationCorpus(mutationQualificationCorpus);

    expect(report.total).toBe(semanticMutants.length);
    expect(report.killed, formatMutationReport(report)).toBe(report.total);
    expect(report.survived).toBe(0);
    expect(report.mutationScore).toBe(1);
    expect(report.medianProgramsToKill).toBeGreaterThan(0);
    expect(report.p95ProgramsToKill).toBeGreaterThan(0);
    expect(report.medianOperationsToKill).toBeGreaterThan(0);
    expect(report.p95OperationsToKill).toBeGreaterThan(0);

    for (const result of report.results) {
      expect(result.reached, result.id).toBe(true);
      expect(result.infected, result.id).toBe(true);
      expect(result.witness, result.id).toBeDefined();
    }
  });

  it("distinguishes an unreached survivor from a killed mutant", () => {
    const report = qualifyMutationCorpus([
      {
        name: "construction only",
        program: [{ type: "signal", id: "value", value: 0 }],
      },
    ]);

    expect(report.killed).toBe(0);
    expect(report.survived).toBe(report.total);
    expect(report.results.every((result) => !result.reached)).toBe(true);
  });

  it("renders a stable human-readable qualification summary", () => {
    const report = qualifyMutationCorpus(mutationQualificationCorpus);
    const summary = formatMutationReport(report);

    expect(summary).toContain(
      "semantic mutants killed: " +
        semanticMutants.length +
        "/" +
        semanticMutants.length,
    );
    expect(summary).toContain("mutation score: 100.0%");
    expect(summary).not.toContain(": survived");
  });
});
