import { describe, expect, it } from "vitest";
import {
  compare,
  defineProgram,
  expr,
  op,
  type Program,
} from "../differential/api";

/**
 * F18 (contract open, SEMANTIC_CHARACTERIZATION.md §6): a watcher whose
 * attempt fails on the first read of a throwing computed keeps no retry
 * trigger for that computed. Spec and Reflex agree, so no differential run
 * can see it: SpecRuntime rule 4 was taken from the runtime, not derived.
 * When the cause of the failure is repaired, the watcher is never retried.
 *
 * These cases pin the current answer; a change of either side is an owner
 * decision between "only successful reads are evidence" (today) and "the
 * failed read is retry evidence" (recovery liveness).
 */
const failing = op.computed(
  "c",
  expr.when(expr.read("gate"), expr.fail("boom"), expr.value(1)),
);

const cases: ReadonlyArray<{ program: Program; repairedAt: number }> = [
  {
    // The initial attempt fails: the retry set is empty.
    program: defineProgram("f18/initial", [
      op.signal("gate", true),
      failing,
      op.watcher("w", expr.read("c")),
      op.flush(),
      op.set("gate", false),
      op.flush(),
    ]),
    repairedAt: 5,
  },
  {
    // A committed watcher enters a new branch that fails: the retry set holds
    // only `sel`, which never changes again.
    program: defineProgram("f18/new-branch", [
      op.signal("sel", false),
      op.signal("gate", true),
      failing,
      op.watcher(
        "w",
        expr.when(expr.read("sel"), expr.read("c"), expr.value(0)),
      ),
      op.flush(),
      op.set("sel", true),
      op.flush(),
      op.set("gate", false),
      op.flush(),
    ]),
    repairedAt: 8,
  },
];

describe("F18: recovery after a failed first read of a computed (characterization, uncontracted)", () => {
  for (const { program, repairedAt } of cases) {
    it(`${program.id}: the repaired watcher is not retried`, () => {
      const result = compare(program);

      expect(result.equivalent).toBe(true);
      expect(result.expected[repairedAt - 2]?.error?.message).toBe("boom");
      // With recovery liveness this flush would run `w` with value 1.
      expect(result.expected[repairedAt]).toEqual({ effects: [] });
      expect(result.actual[repairedAt]).toEqual({ effects: [] });
    });
  }
});
