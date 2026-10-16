import { beforeAll, describe, expect, it } from "vitest";
import * as candidateModule from "../../src/internal";
import { BASELINE_COMMIT, loadBaseline } from "./baseline";
import {
  firstMismatch,
  generateProgram,
  interpret,
  programSize,
  selfInvalidates,
  shrink,
  touchesEpoch,
  type ObservationLevel,
  type Program,
  type RuntimeModule,
} from "./program";

/**
 * Baseline differential oracle: the implementation under test must produce the
 * same observation trace as the frozen baseline bundle for every generated
 * program. Reproduce a failure with ORACLE_SEED=<seed>.
 *
 * Divergences are allowed only where the baseline is demonstrably wrong, as
 * compatibility divergences counted per class:
 *
 * - F13. The baseline's clock rewinds and wraps, so in a program with an
 *   `epoch` operation a pass can repeat a stamp still carried by a live edge
 *   and the baseline drops a dependency. Accepted only for such a program, only
 *   if the baseline violates a structural invariant and the candidate violates
 *   none.
 * - F15. The baseline leaves a dirty watcher without delivery. Accepted only if
 *   the baseline violates the liveness invariant and the candidate violates
 *   none.
 * - F1 domain. A consumer can invalidate itself during its own evaluation (F1,
 *   open), where liveness is not required. Accepted only if the first
 *   divergence is an extra candidate delivery and the candidate violates no
 *   invariant outside the known F1 liveness class.
 */
const violations = (rt: RuntimeModule, program: Program): string[] =>
  interpret(rt, program, "strict", { invariants: true }).filter((entry) =>
    entry.startsWith("invariant:"),
  );
const isLiveness = (entry: string) => entry.startsWith("invariant:liveness:");

const isF13Correction = (program: Program): boolean =>
  touchesEpoch(program.ops) &&
  violations(baseline, program).some((entry) => !isLiveness(entry)) &&
  violations(candidate, program).length === 0;

const isF15Correction = (program: Program): boolean =>
  violations(baseline, program).some(isLiveness) &&
  violations(candidate, program).length === 0;

const isDelivery = (entry: string | undefined): boolean =>
  entry !== undefined &&
  (entry.startsWith("inv:") || entry.startsWith("hook-action:"));

const isF1DomainDelivery = (program: Program, level: ObservationLevel) =>
  selfInvalidates(program.spec) &&
  isDelivery(
    firstMismatch(
      interpret(baseline, program, level),
      interpret(candidate, program, level),
    )?.candidate,
  ) &&
  violations(candidate, program).every(isLiveness);

const corrected = { F13: 0, F15: 0, F1domain: 0 };
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
  if (isF13Correction(program)) {
    corrected.F13++;
    return null;
  }
  if (isF15Correction(program)) {
    corrected.F15++;
    return null;
  }
  if (isF1DomainDelivery(program, level)) {
    corrected.F1domain++;
    return null;
  }
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
      corrected.F13 = corrected.F15 = corrected.F1domain = 0;
      const count = ONLY_ONE ? 1 : SEEDS;
      for (let seed = FIRST_SEED; seed < FIRST_SEED + count; seed++) {
        const failure = report(seed, level, generateProgram(seed));
        if (failure !== null) throw new Error(failure);
      }
      console.info(`compatibility divergences (${level}):`, corrected);
    },
    600_000,
  );
});
