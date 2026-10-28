import { resetRuntimeContext } from "../../../src";
import type { Observation, Op } from "../api";
import { expr, op } from "../api";
import { observationsEqual } from "../internal/machine/eval";
import { ReflexMachine } from "../internal/machine/ReflexMachine";
import { SpecMachine } from "../internal/machine/SpecMachine";
import { SpecRuntime } from "../internal/machine/spec-runtime";

export interface ActiveDivergence {
  id: string;
  boundary: string;
  severity: "high" | "critical";
  consequence: string;
  discoveredBy: string;
  operationIndex: number;
  expected: Observation;
  actual: Observation;
  program: readonly Op[];
}

const { signal, computed, watcher, set, flush } = op;

const failingComputed = computed(
  "c",
  expr.when(expr.read("gate"), expr.fail("boom"), expr.value(1)),
);

const F18 = {
  boundary: "failure recovery / causal retry evidence (SpecRuntime rule 4)",
  severity: "high",
  consequence:
    "A watcher whose attempt failed on reading a throwing computed is never retried after the cause is repaired.",
  discoveredBy:
    "characterization of SpecRuntime rule 4 (2026-10-28); contract decided the same day",
} as const;

export const activeDivergences: readonly ActiveDivergence[] = [
  {
    id: "F18-initial-attempt",
    ...F18,
    operationIndex: 5,
    expected: { effects: [{ effect: "w", phase: "run", value: 1 }] },
    actual: { effects: [] },
    program: [
      signal("gate", true),
      failingComputed,
      watcher("w", expr.read("c")),
      flush(),
      set("gate", false),
      flush(),
    ],
  },
  {
    id: "F18-new-branch",
    ...F18,
    operationIndex: 8,
    expected: { effects: [{ effect: "w", phase: "run", value: 1 }] },
    actual: { effects: [] },
    program: [
      signal("sel", false),
      signal("gate", true),
      failingComputed,
      watcher("w", expr.when(expr.read("sel"), expr.read("c"), expr.value(0))),
      flush(),
      set("sel", true),
      flush(),
      set("gate", false),
      flush(),
    ],
  },
];

/**
 * The active divergence class of a mismatching program, if it has one. F18 is
 * recognized by evidence, not by shape: Reflex must agree, at every operation,
 * with the spec that keeps the previous rule 4 (failed reads are no retry
 * evidence). Any other difference stays a failure, and once the runtime
 * follows the new rule no program qualifies.
 */
export function activeDivergenceOf(program: readonly Op[]): "F18" | undefined {
  resetRuntimeContext();
  const previousRule = new SpecMachine(
    new SpecRuntime({ failedReadEvidence: false }),
  );
  const reflex = new ReflexMachine();

  for (const operation of program) {
    if (
      !observationsEqual(
        reflex.execute(operation),
        previousRule.execute(operation),
      )
    )
      return undefined;
  }

  return "F18";
}
