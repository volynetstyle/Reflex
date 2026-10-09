import { execute } from "./execute";
import {
  classifyEvidence,
  canonicalTraces,
  coverPrograms,
  difference,
  generateTrace,
  interactionMatrix,
  programFeatures,
  shrinkCase,
  traceFeatures,
  transformations,
  validateCase,
  type Case,
  type Evidence,
  type Finding,
  type InteractionCount,
  type Observation,
  type Program,
  type Strategy,
} from "./model";

export interface Comparison {
  seed: number;
  strategy: Strategy;
  traceFamily: string;
  input: Case;
  transformation: string;
  baseline: Observation;
  variant: Observation;
  issues: readonly string[];
  minimal?: Case;
}

export interface ExplorerReport {
  baselines: readonly {
    input: Case;
    traceFamily: string;
    observation: Observation;
  }[];
  comparisons: readonly Comparison[];
  classifications: Readonly<Record<string, Finding>>;
  interactions: readonly InteractionCount[];
}

/** Runs the generated suite and retains replayable evidence, including shrunk failures. */
export async function explore(
  strategy: Strategy = "eager",
  programs: readonly Program[] = coverPrograms(),
): Promise<ExplorerReport> {
  const baselines: {
    input: Case;
    traceFamily: string;
    observation: Observation;
  }[] = [];
  const comparisons: Comparison[] = [];
  const records: { features: string[]; diverged: boolean }[] = [];
  const evidence = new Map<string, Evidence[]>();

  for (const [index, program] of programs.entries()) {
    const seed = (0x9e3779b9 + index * 0x85ebca6b) >>> 0;
    const families = canonicalTraces(program);
    if (program.host === "dom") {
      families.push({ name: "fuzz", trace: generateTrace(seed) });
    }
    for (const family of families) {
      const input: Case = { program, trace: family.trace };
      const baseline = await execute(input, strategy);
      baselines.push({
        input,
        traceFamily: family.name,
        observation: baseline,
      });
      for (const transformation of transformations) {
        if (!transformation.applicable(input)) continue;
        const variant = await execute(
          transformation.transform(input),
          strategy,
        );
        const issues = difference(baseline, variant, transformation.relation);
        const minimal =
          issues.length === 0
            ? undefined
            : await shrinkCase(input, async (candidate) => {
                if (!transformation.applicable(candidate)) return false;
                try {
                  validateCase(candidate);
                  const transformed = transformation.transform(candidate);
                  validateCase(transformed);
                  const left = await execute(candidate, strategy);
                  const right = await execute(transformed, strategy);
                  return difference(left, right, transformation.relation).some(
                    (issue) => issues.includes(issue),
                  );
                } catch {
                  return false;
                }
              });
        comparisons.push({
          seed,
          strategy,
          traceFamily: family.name,
          input,
          transformation: transformation.name,
          baseline,
          variant,
          issues,
          ...(minimal === undefined ? {} : { minimal }),
        });
        records.push({
          features: [
            ...programFeatures(program),
            `strategy=${strategy}`,
            `transform=${transformation.name}`,
            `family=${family.name}`,
            ...traceFeatures(input.trace),
          ],
          diverged: issues.length > 0,
        });
        const samples = evidence.get(transformation.name) ?? [];
        samples.push({ baseline, variant, issues });
        evidence.set(transformation.name, samples);
      }
    }
  }

  const classifications: Record<string, Finding> = {};
  for (const [name, samples] of evidence) {
    classifications[name] = classifyEvidence("equivalent", samples);
  }
  return {
    baselines,
    comparisons,
    classifications,
    interactions: interactionMatrix(records),
  };
}
