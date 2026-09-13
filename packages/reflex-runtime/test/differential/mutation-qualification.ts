import {
  SpecMachine,
  observationsEqual,
  type Observation,
  type Op,
} from "./harness";
import {
  MutantRuntime,
  semanticMutants,
  type SemanticMutantId,
} from "./mutant-runtime";

export interface QualificationProgram {
  name: string;
  program: readonly Op[];
}

export interface SemanticMutantDefinition {
  id: SemanticMutantId;
  description: string;
}

export type MismatchClass = "value" | "error" | "effects" | "shape";

export interface MutantQualification {
  id: SemanticMutantId;
  description: string;
  status: "killed" | "survived";
  reached: boolean;
  infected: boolean;
  programsExecuted: number;
  operationsExecuted: number;
  witness?: {
    program: string;
    operationIndex: number;
    mismatchClass: MismatchClass;
    expected: Observation;
    actual: Observation;
    prefix: readonly Op[];
  };
}

export interface MutationQualificationReport {
  total: number;
  killed: number;
  survived: number;
  mutationScore: number;
  medianProgramsToKill: number | undefined;
  p95ProgramsToKill: number | undefined;
  medianOperationsToKill: number | undefined;
  p95OperationsToKill: number | undefined;
  results: MutantQualification[];
}

export function qualifyMutationCorpus(
  corpus: readonly QualificationProgram[],
  mutants: readonly SemanticMutantDefinition[] = semanticMutants,
): MutationQualificationReport {
  const results = mutants.map((definition) =>
    qualifyMutant(definition.id, definition.description, corpus),
  );
  const killedResults = results.filter((result) => result.status === "killed");
  const killed = killedResults.length;
  const programLatencies = killedResults.map(
    (result) => result.programsExecuted,
  );
  const operationLatencies = killedResults.map(
    (result) => result.operationsExecuted,
  );

  return {
    total: results.length,
    killed,
    survived: results.length - killed,
    mutationScore: results.length === 0 ? 1 : killed / results.length,
    medianProgramsToKill: percentile(programLatencies, 0.5),
    p95ProgramsToKill: percentile(programLatencies, 0.95),
    medianOperationsToKill: percentile(operationLatencies, 0.5),
    p95OperationsToKill: percentile(operationLatencies, 0.95),
    results,
  };
}

export function formatMutationReport(
  report: MutationQualificationReport,
): string {
  const lines = [
    "semantic mutants killed: " + report.killed + "/" + report.total,
    "mutation score: " + (report.mutationScore * 100).toFixed(1) + "%",
    "median programs to kill: " + formatLatency(report.medianProgramsToKill),
    "p95 programs to kill: " + formatLatency(report.p95ProgramsToKill),
    "median operations to kill: " +
      formatLatency(report.medianOperationsToKill),
    "p95 operations to kill: " + formatLatency(report.p95OperationsToKill),
  ];

  for (const result of report.results) {
    const location =
      result.witness === undefined
        ? ""
        : " by " +
          result.witness.program +
          " at operation " +
          result.witness.operationIndex;
    lines.push(
      "- " +
        result.id +
        ": " +
        result.status +
        location +
        " (reached=" +
        result.reached +
        ", infected=" +
        result.infected +
        ")",
    );
  }

  return lines.join("\n");
}

function qualifyMutant(
  id: SemanticMutantId,
  description: string,
  corpus: readonly QualificationProgram[],
): MutantQualification {
  let reached = false;
  let infected = false;
  let programsExecuted = 0;
  let operationsExecuted = 0;

  for (const candidate of corpus) {
    programsExecuted += 1;
    const oracle = new SpecMachine();
    const mutantRuntime = new MutantRuntime(id);
    const mutant = new SpecMachine(mutantRuntime);

    for (
      let operationIndex = 0;
      operationIndex < candidate.program.length;
      operationIndex += 1
    ) {
      const operation = candidate.program[operationIndex]!;
      operationsExecuted += 1;
      const expected = oracle.execute(operation);
      const actual = mutant.execute(operation);

      reached ||= mutantRuntime.probe.reached;
      infected ||= mutantRuntime.probe.infected;

      if (!observationsEqual(actual, expected)) {
        if (!mutantRuntime.probe.reached) {
          throw new Error(
            "Mutant '" +
              id +
              "' diverged before its mutation point was reached",
          );
        }
        if (!mutantRuntime.probe.infected) {
          throw new Error(
            "Mutant '" + id + "' diverged without infecting semantic state",
          );
        }

        return {
          id,
          description,
          status: "killed",
          reached,
          infected,
          programsExecuted,
          operationsExecuted,
          witness: {
            program: candidate.name,
            operationIndex,
            mismatchClass: classifyMismatch(expected, actual),
            expected,
            actual,
            prefix: candidate.program.slice(0, operationIndex + 1),
          },
        };
      }
    }
  }

  return {
    id,
    description,
    status: "survived",
    reached,
    infected,
    programsExecuted,
    operationsExecuted,
  };
}

function classifyMismatch(
  expected: Observation,
  actual: Observation,
): MismatchClass {
  if ("value" in expected !== "value" in actual) return "shape";
  if (
    "value" in expected &&
    "value" in actual &&
    !Object.is(expected.value, actual.value)
  ) {
    return "value";
  }

  if ("error" in expected !== "error" in actual) return "error";
  if (
    expected.error?.name !== actual.error?.name ||
    expected.error?.message !== actual.error?.message
  ) {
    return "error";
  }

  return "effects";
}
function percentile(
  values: readonly number[],
  percentileValue: number,
): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(percentileValue * sorted.length) - 1);
  return sorted[index];
}

function formatLatency(value: number | undefined): string {
  return value === undefined ? "n/a" : String(value);
}
