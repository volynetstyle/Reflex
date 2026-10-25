import { beforeAll, describe, expect, it } from "vitest";
import { loadBaseline, loadOracleBundle } from "./baseline";
import {
  firstMismatch,
  generateHubProgram,
  generateProgram,
  interpret,
  programSize,
  shrink,
  type Program,
  type RuntimeModule,
} from "./program";

/**
 * Oracle qualification: each seeded mutant changes one kernel decision. The
 * oracle must distinguish it from the baseline within the seed budget.
 * Mutants are built from the working tree, so they also prove that the
 * working tree itself still builds into a comparable bundle.
 */
interface Mutant {
  id: string;
  file: string;
  search: string;
  replace: string;
  /** Mutants the current generator cannot reach are documented gaps. */
  expected: "killed" | "gap";
  /** Program family; the default generator unless the mutant needs hubs. */
  generator?: "hub";
}

const MUTANTS: Mutant[] = [
  {
    id: "push-transitive-overmark",
    file: "src/kernel/stages/propagation/push_iterator.ts",
    search: "next = (state & ~Visited) | Unknown;",
    replace: "next = (state & ~Visited) | Changed;",
    expected: "killed",
  },
  {
    id: "advance-skip-stale-cleanup",
    file: "src/kernel/stages/stabilization/advance.ts",
    search: "cleanupUnvisitedSources(node);",
    replace: "void cleanupUnvisitedSources;",
    expected: "killed",
  },
  {
    id: "write-skip-equality",
    file: "src/protocol/write.producer.ts",
    search: "if (sameWrittenValue(prev, value) === true) {",
    replace: "if (false && sameWrittenValue(prev, value) === true) {",
    expected: "killed",
  },
  {
    id: "pull-keep-unknown-on-stable-pop",
    file: "src/kernel/stages/stabilization/pull_iterator.ts",
    search: "node.state &= ~Unknown;",
    replace: "void 0;",
    expected: "killed",
  },
  {
    id: "push-drop-computing-evidence",
    file: "src/kernel/stages/propagation/push_iterator.ts",
    search: "return (sub.state = state | Visited | Unknown);",
    replace: "return 0;",
    expected: "killed",
  },
  {
    id: "push-once-redeliver-scheduled",
    file: "src/kernel/stages/propagation/push_iterator_once.ts",
    search: "if ((state & (Scheduled | Computing)) !== 0) {",
    replace: "if (false) {",
    expected: "killed",
  },
  {
    id: "push-redeliver-unknown-watcher",
    file: "src/kernel/stages/propagation/push_iterator.ts",
    search: "if ((state & (Unknown | Computing)) === Unknown) continue;",
    replace: "void 0;",
    expected: "killed",
  },
  {
    // A located current-pass edge is taken for a suffix edge, so a duplicate
    // read moves it after the cursor and reorders the incoming list.
    id: "prefix-stamp-classification-false",
    file: "src/kernel/stages/tracking/prefix.ts",
    search: "if (stamp !== 0) return edge.stamp === stamp;",
    replace: "if (stamp !== 0) return false;",
    expected: "killed",
  },
  {
    // A hint that outlives its edge (INV-H): after the consumer drops the
    // dependency, a later lookup of the same pair returns the detached edge.
    id: "hint-keep-on-unlink",
    file: "src/kernel/shape/graph/sweepEdges.ts",
    search: "if (from.tailIn === edge) from.tailIn = null;",
    replace: "void 0;",
    expected: "killed",
    generator: "hub",
  },
];

const BUDGET = Number(process.env.ORACLE_QUALIFICATION_SEEDS ?? 2_000);
let baseline: RuntimeModule;

beforeAll(async () => {
  baseline = await loadBaseline();
}, 120_000);

describe("baseline oracle qualification", () => {
  it.each(MUTANTS)(
    "$id is $expected",
    async (mutant) => {
      const label = `mutant-${mutant.id}`;
      const runtime = await loadOracleBundle(
        [
          "--source",
          "--mutate",
          `${mutant.file}::${mutant.search}::${mutant.replace}`,
        ],
        label,
      );
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
