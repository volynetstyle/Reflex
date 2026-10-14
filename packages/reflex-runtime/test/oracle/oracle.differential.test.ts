import { beforeAll, describe, expect, it } from "vitest";
import * as candidateModule from "../../src/internal";
import { BASELINE_COMMIT, loadBaseline } from "./baseline";
import {
  firstMismatch,
  generateProgram,
  interpret,
  programSize,
  shrink,
  type ObservationLevel,
  type Program,
  type RuntimeModule,
} from "./program";

/**
 * Baseline differential oracle: the implementation under test must produce the
 * same observation trace as the frozen baseline bundle for every generated
 * program. Reproduce a failure with ORACLE_SEED=<seed>.
 */
const candidate = candidateModule as unknown as RuntimeModule;
const SEEDS = Number(process.env.ORACLE_SEEDS ?? 2_000);
const FIRST_SEED = Number(process.env.ORACLE_SEED ?? 1);
const ONLY_ONE = process.env.ORACLE_SEED !== undefined;

let baseline: RuntimeModule;

beforeAll(async () => {
  baseline = await loadBaseline();
}, 120_000);

function report(
  seed: number,
  level: ObservationLevel,
  program: Program,
): string | null {
  const fails = (p: Program) =>
    firstMismatch(
      interpret(baseline, p, level),
      interpret(candidate, p, level),
    ) !== null;
  if (!fails(program)) return null;
  const minimal = shrink(program, fails);
  const mismatch = firstMismatch(
    interpret(baseline, minimal, level),
    interpret(candidate, minimal, level),
  );
  return [
    `Divergence from baseline ${BASELINE_COMMIT.slice(0, 12)} (${level}), seed ${seed}.`,
    `Minimized program (size ${programSize(minimal)} from ${programSize(program)}):`,
    JSON.stringify(minimal),
    `First mismatch: ${JSON.stringify(mismatch)}`,
  ].join("\n");
}

describe(`baseline differential oracle (${BASELINE_COMMIT.slice(0, 12)})`, () => {
  it("interprets programs deterministically", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const program = generateProgram(seed);
      expect(interpret(baseline, program)).toEqual(
        interpret(baseline, program),
      );
      expect(interpret(candidate, program)).toEqual(
        interpret(candidate, program),
      );
    }
  });

  it.each<ObservationLevel>(["strict", "observable"])(
    "matches the baseline on generated programs (%s)",
    (level) => {
      const count = ONLY_ONE ? 1 : SEEDS;
      for (let seed = FIRST_SEED; seed < FIRST_SEED + count; seed++) {
        const failure = report(seed, level, generateProgram(seed));
        if (failure !== null) throw new Error(failure);
      }
    },
    600_000,
  );
});
