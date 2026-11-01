import { beforeAll, describe, expect, it } from "vitest";
import { loadBaseline, loadSource } from "./baseline";
import {
  firstMismatch,
  generateHubProgram,
  generateProgram,
  interpret,
  programSize,
  shrink,
  type Program,
  type RuntimeModule,
} from "../../testkit/oracle/program";
import { MUTANTS, mutationArgument } from "../../testkit/oracle/mutants";

/**
 * Oracle qualification: each seeded mutant changes one kernel decision. The
 * oracle must distinguish it from the baseline within the seed budget.
 * Mutants are built from the working tree, so they also prove that the
 * working tree itself still builds into a comparable bundle. The catalog is
 * ./mutants.ts; `pnpm rt mutate` reports the same mutants as a kill matrix.
 */
const BUDGET = Number(process.env.ORACLE_QUALIFICATION_SEEDS ?? 2_000);
let baseline: RuntimeModule;

beforeAll(async () => {
  baseline = await loadBaseline();
}, 120_000);

describe("baseline oracle qualification", () => {
  it.each(MUTANTS)(
    "$id is $expected",
    async (mutant) => {
      const runtime = await loadSource({
        mutations: [mutationArgument(mutant)],
      });
      const fails = (program: Program) =>
        firstMismatch(
          interpret(baseline, program),
          interpret(runtime, program),
        ) !== null;

      const generate =
        mutant.generator === "hub" ? generateHubProgram : generateProgram;
      let killedAt: number | undefined;
      for (let seed = 1; seed <= BUDGET; seed++) {
        if (fails(generate(seed))) {
          killedAt = seed;
          break;
        }
      }

      if (mutant.expected === "gap") {
        expect(killedAt, "a documented gap became reachable").toBeUndefined();
        return;
      }
      expect(killedAt, `${mutant.id} survived ${BUDGET} seeds`).toBeDefined();
      const original = generate(killedAt!);
      const minimal = shrink(original, fails);
      expect(fails(minimal)).toBe(true);
      expect(programSize(minimal)).toBeLessThanOrEqual(programSize(original));
    },
    300_000,
  );
});
