import { beforeAll, describe, expect, it } from "vitest";
import * as candidateModule from "../../src/internal";
import { BASELINE_COMMIT, loadBaseline } from "./baseline";
import { family } from "../../testkit/oracle/families";
import {
  generateHubProgram,
  generateProgram,
  interpret,
  programSize,
  selfInvalidates,
  shrink,
  type Program,
  type RuntimeModule,
} from "../../testkit/oracle/program";

/**
 * Algorithm-independent oracle: integrity and exact dependency sets checked
 * after every operation (see `InterpretOptions`). Unlike the differential
 * oracle it needs no reference implementation, so a defect shared with the
 * baseline cannot hide. Reproduce a failure with ORACLE_SEED=<seed>.
 *
 * Liveness violations in a program where a consumer can invalidate itself
 * during its own evaluation are F1 (open, owner decision): they are counted
 * as known and do not fail the run. Every other violation does.
 */
const candidate = candidateModule as unknown as RuntimeModule;
const SEEDS = Number(process.env.ORACLE_SEEDS ?? 2_000);
const FIRST_SEED = Number(process.env.ORACLE_SEED ?? 1);
const ONLY_ONE = process.env.ORACLE_SEED !== undefined;
const HUB_SEEDS = Number(process.env.ORACLE_HUB_SEEDS ?? 1_000);
const GENERAL_SEEDS = Number(process.env.ORACLE_GENERAL_SEEDS ?? 2_000);

const violations = (rt: RuntimeModule, program: Program): string[] =>
  interpret(rt, program, "strict", { invariants: true }).filter((entry) =>
    entry.startsWith("invariant:"),
  );

const isKnownF1 = (program: Program, entry: string): boolean =>
  entry.startsWith("invariant:liveness:") && selfInvalidates(program.spec);

const unexplained = (rt: RuntimeModule, program: Program): string[] =>
  violations(rt, program).filter((entry) => !isKnownF1(program, entry));

let knownF1 = 0;
let baseline: RuntimeModule;

beforeAll(async () => {
  baseline = await loadBaseline();
}, 120_000);

describe("algorithm-independent invariants", () => {
  it("hold on every generated program", () => {
    const count = ONLY_ONE ? 1 : SEEDS;
    for (let seed = FIRST_SEED; seed < FIRST_SEED + count; seed++) {
      const program = generateProgram(seed);
      if (unexplained(candidate, program).length === 0) {
        if (violations(candidate, program).length !== 0) knownF1++;
        continue;
      }
      const minimal = shrink(
        program,
        (p) => unexplained(candidate, p).length !== 0,
      );
      throw new Error(
        [
          `Invariant violation, seed ${seed}.`,
          `Minimized program (size ${programSize(minimal)} from ${programSize(program)}):`,
          JSON.stringify(minimal),
          unexplained(candidate, minimal)[0],
        ].join("\n"),
      );
    }
    // Recorded, not asserted: a fix for F1 should drive this to zero.
    if (knownF1 !== 0) console.info(`known F1 liveness programs: ${knownF1}`);
  }, 600_000);

  // Hub programs exercise the outgoing hint (INV-H): fills, hits, unlinks
  // under cleanup and disposal, recomputation of a hinted computed producer.
  it("hold on every generated hub program", () => {
    for (let seed = 1; seed <= HUB_SEEDS; seed++) {
      const program = generateHubProgram(seed);
      if (unexplained(candidate, program).length === 0) continue;
      const minimal = shrink(
        program,
        (p) => unexplained(candidate, p).length !== 0,
      );
      throw new Error(
        [
          `Invariant violation, hub seed ${seed}.`,
          `Minimized program (size ${programSize(minimal)} from ${programSize(program)}):`,
          JSON.stringify(minimal),
          unexplained(candidate, minimal)[0],
        ].join("\n"),
      );
    }
  }, 600_000);

  // The default seeds below 960 are wide or deep specs only (program.ts,
  // prng); the general family samples the generator's intended mix. The
  // invariants need no baseline, so these programs are checked here even
  // while their baseline differences are open (corpus/general-*).
  it("hold on every generated general program", () => {
    let generalF1 = 0;
    for (let seed = 1; seed <= GENERAL_SEEDS; seed++) {
      const program = family("general").generate(seed);
      if (unexplained(candidate, program).length === 0) {
        if (violations(candidate, program).length !== 0) generalF1++;
        continue;
      }
      const minimal = shrink(
        program,
        (p) => unexplained(candidate, p).length !== 0,
      );
      throw new Error(
        [
          `Invariant violation, general seed ${seed}.`,
          `Minimized program (size ${programSize(minimal)} from ${programSize(program)}):`,
          JSON.stringify(minimal),
          unexplained(candidate, minimal)[0],
        ].join("\n"),
      );
    }
    if (generalF1 !== 0)
      console.info(`known F1 liveness programs (general): ${generalF1}`);
  }, 600_000);

  // The checker must see a lost dependency: the baseline drops one through
  // F13 on this generated program.
  it(`detects F13 in the baseline ${BASELINE_COMMIT.slice(0, 12)}`, () => {
    expect(violations(baseline, generateProgram(92))).not.toEqual([]);
  });

  // The checker must see a lost delivery: the baseline leaves a dirty watcher
  // undelivered (F15) on this generated program, outside the F1 domain.
  it(`detects F15 in the baseline ${BASELINE_COMMIT.slice(0, 12)}`, () => {
    const program = generateProgram(1276);
    expect(selfInvalidates(program.spec)).toBe(false);
    expect(
      violations(baseline, program).some((entry) =>
        entry.startsWith("invariant:liveness:"),
      ),
    ).toBe(true);
    expect(violations(candidate, program)).toEqual([]);
  });
});
