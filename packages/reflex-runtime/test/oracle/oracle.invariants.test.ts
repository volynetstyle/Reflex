import { beforeAll, describe, expect, it } from "vitest";
import * as candidateModule from "../../src/internal";
import { BASELINE_COMMIT, loadBaseline } from "./baseline";
import {
  generateProgram,
  interpret,
  programSize,
  shrink,
  touchesEpoch,
  type Program,
  type RuntimeModule,
} from "./program";

/**
 * Algorithm-independent oracle: integrity and exact dependency sets checked
 * after every operation (see `InterpretOptions`). Unlike the differential
 * oracle it needs no reference implementation, so a defect shared with the
 * baseline cannot hide. Reproduce a failure with ORACLE_SEED=<seed>.
 */
const candidate = candidateModule as unknown as RuntimeModule;
const SEEDS = Number(process.env.ORACLE_SEEDS ?? 2_000);
const FIRST_SEED = Number(process.env.ORACLE_SEED ?? 1);
const ONLY_ONE = process.env.ORACLE_SEED !== undefined;

const violations = (rt: RuntimeModule, program: Program): string[] =>
  interpret(rt, program, "strict", { invariants: true }).filter((entry) =>
    entry.startsWith("invariant:"),
  );

let baseline: RuntimeModule;

beforeAll(async () => {
  baseline = await loadBaseline();
}, 120_000);

describe("algorithm-independent invariants", () => {
  it("hold on every generated program outside the F13 area", () => {
    const count = ONLY_ONE ? 1 : SEEDS;
    for (let seed = FIRST_SEED; seed < FIRST_SEED + count; seed++) {
      const program = generateProgram(seed);
      if (touchesEpoch(program.ops)) continue;
      if (violations(candidate, program).length === 0) continue;
      const minimal = shrink(
        program,
        (p) => violations(candidate, p).length !== 0,
      );
      throw new Error(
        [
          `Invariant violation, seed ${seed}.`,
          `Minimized program (size ${programSize(minimal)} from ${programSize(program)}):`,
          JSON.stringify(minimal),
          violations(candidate, minimal)[0],
        ].join("\n"),
      );
    }
  }, 600_000);

  // The checker must see a lost dependency: the baseline drops one through
  // F13 on this generated program.
  it(`detects F13 in the baseline ${BASELINE_COMMIT.slice(0, 12)}`, () => {
    expect(violations(baseline, generateProgram(92))).not.toEqual([]);
  });
});
