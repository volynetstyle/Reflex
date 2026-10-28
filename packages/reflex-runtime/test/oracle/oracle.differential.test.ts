import { beforeAll, describe, expect, it } from "vitest";
import * as candidateModule from "../../src/internal";
import { BASELINE_COMMIT, loadBaseline } from "./baseline";
import {
  firstMismatch,
  generateHubProgram,
  generateProgram,
  interpret,
  programSize,
  type ObservationLevel,
  type Program,
  type RuntimeModule,
} from "./program";
import { minimize } from "./reduce";
import {
  ACCEPTED_CLASSES,
  judge,
  rejects,
  type AcceptedClass,
} from "./verdict";

/**
 * Baseline differential oracle: the implementation under test must produce the
 * same observation trace as the frozen baseline bundle for every generated
 * program. Reproduce a failure with ORACLE_SEED=<seed>, or
 * `pnpm rt replay --family default --seed <seed>`.
 *
 * Divergences are allowed only where the baseline is demonstrably wrong
 * (F13, F15, F1 domain, F17, F16) or differs only in representation (list-order,
 * event-order), as compatibility divergences counted per class. The
 * acceptance rules and their evidence are owned by ./verdict.ts (policy
 * `baseline`).
 */
const corrected = Object.fromEntries(
  ACCEPTED_CLASSES.map((name) => [name, 0]),
) as Record<AcceptedClass, number>;
// Seeds whose traces part where both sides exhaust the stack (verdict.ts).
const inconclusive: number[] = [];
const candidate = candidateModule as unknown as RuntimeModule;
const SEEDS = Number(process.env.ORACLE_SEEDS ?? 2_000);
const FIRST_SEED = Number(process.env.ORACLE_SEED ?? 1);
const ONLY_ONE = process.env.ORACLE_SEED !== undefined;
const HUB_SEEDS = Number(process.env.ORACLE_HUB_SEEDS ?? 1_000);

let baseline: RuntimeModule;

beforeAll(async () => {
  baseline = await loadBaseline();
}, 120_000);

function report(
  seed: number,
  level: ObservationLevel,
  program: Program,
): string | null {
  const verdict = judge(baseline, candidate, program, level, "baseline");
  if (verdict.kind === "identical") return null;
  if (verdict.kind === "accepted") {
    corrected[verdict.class]++;
    return null;
  }
  if (verdict.kind === "inconclusive") {
    inconclusive.push(seed);
    return null;
  }
  const minimal = minimize(
    program,
    rejects(baseline, candidate, level, "baseline"),
  );
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
      for (const key of Object.keys(corrected))
        corrected[key as keyof typeof corrected] = 0;
      const count = ONLY_ONE ? 1 : SEEDS;
      for (let seed = FIRST_SEED; seed < FIRST_SEED + count; seed++) {
        const failure = report(seed, level, generateProgram(seed));
        if (failure !== null) throw new Error(failure);
      }
      console.info(`compatibility divergences (${level}):`, corrected);
      if (inconclusive.length > 0)
        console.info(
          `inconclusive (stack limit, ${level}):`,
          inconclusive.splice(0),
        );
    },
    600_000,
  );

  // Hub programs re-read wide producers inside wide consumers, so pair
  // lookups pass the outgoing head start and use the hint (INV-H).
  // Reproduce a failure with ORACLE_HUB_SEED=<seed>.
  it.each<ObservationLevel>(["strict", "observable"])(
    "matches the baseline on hub programs (%s)",
    (level) => {
      for (const key of Object.keys(corrected))
        corrected[key as keyof typeof corrected] = 0;
      const first = Number(process.env.ORACLE_HUB_SEED ?? 1);
      const count = process.env.ORACLE_HUB_SEED !== undefined ? 1 : HUB_SEEDS;
      for (let seed = first; seed < first + count; seed++) {
        const failure = report(seed, level, generateHubProgram(seed));
        if (failure !== null) throw new Error(`hub ${failure}`);
      }
      console.info(`hub compatibility divergences (${level}):`, corrected);
      if (inconclusive.length > 0)
        console.info(
          `hub inconclusive (stack limit, ${level}):`,
          inconclusive.splice(0),
        );
    },
    600_000,
  );
});
