import { beforeAll, describe, expect, it } from "vitest";
import * as candidateModule from "../../src/internal";
import { BASELINE_COMMIT, loadBaseline } from "./baseline";
import {
  classifyTraceDifference,
  firstMismatch,
  generateHubProgram,
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
 * - F17. The baseline hands a watcher to the host while that watcher is
 *   inside its own run, after the host released its claim: a pull proof
 *   recomputed a node with a side edge into the validating watcher, whose
 *   current pass already consumes that evidence. Accepted only if the first
 *   divergence is such a baseline delivery and the candidate violates no
 *   invariant.
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

const isF17OwnEpochDelivery = (
  program: Program,
  level: ObservationLevel,
): boolean => {
  const ownEpoch: number[] = [];
  const mismatch = firstMismatch(
    interpret(baseline, program, level, { ownEpochDeliveries: ownEpoch }),
    interpret(candidate, program, level),
  );
  return (
    mismatch !== null &&
    isDelivery(mismatch.baseline) &&
    ownEpoch.includes(mismatch.index) &&
    violations(candidate, program).length === 0
  );
};

/**
 * Representation differences (SEMANTIC_CONTRACT, "Semantic and representation
 * equivalence"): the traces agree once adjacency order (list-order) or,
 * additionally, sibling delivery and execution order (event-order) is not
 * compared, and the candidate violates no invariant the baseline does not.
 * Counted, not failed: the baseline's representation is not a specification.
 */
const isRepresentationDifference = (
  program: Program,
  level: ObservationLevel,
): "list-order" | "event-order" | null => {
  const kind = classifyTraceDifference(
    interpret(baseline, program, level),
    interpret(candidate, program, level),
  );
  if (kind !== "list-order" && kind !== "event-order") return null;
  const accepted = new Set(violations(baseline, program));
  return violations(candidate, program).every((entry) => accepted.has(entry))
    ? kind
    : null;
};

const corrected = {
  F13: 0,
  F15: 0,
  F1domain: 0,
  F17: 0,
  "list-order": 0,
  "event-order": 0,
};
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
  if (isF17OwnEpochDelivery(program, level)) {
    corrected.F17++;
    return null;
  }
  const representation = isRepresentationDifference(program, level);
  if (representation !== null) {
    corrected[representation]++;
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
      for (const key of Object.keys(corrected))
        corrected[key as keyof typeof corrected] = 0;
      const count = ONLY_ONE ? 1 : SEEDS;
      for (let seed = FIRST_SEED; seed < FIRST_SEED + count; seed++) {
        const failure = report(seed, level, generateProgram(seed));
        if (failure !== null) throw new Error(failure);
      }
      console.info(`compatibility divergences (${level}):`, corrected);
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
    },
    600_000,
  );
});
