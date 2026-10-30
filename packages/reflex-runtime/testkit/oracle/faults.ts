/**
 * Fault-model inventory: the claims the checks of the runtime must defend and
 * the kernel mutants that violate each claim. `pnpm rt audit` runs every
 * mutant against every gating vitest suite and the program corpus, so the
 * question "which fault passes CI if this test file goes?" has a measured
 * answer.
 *
 * Mutants have one of two roles:
 *
 * - `development`: the oracle catalog (mutants.ts). Test-suite reduction may
 *   be decided from their kills.
 * - `holdout`: never used to decide a reduction, only to evaluate one. Four
 *   are real faults: the fix of a documented finding reverted
 *   (SEMANTIC_CHARACTERIZATION.md §6). A reduction that keeps every
 *   development kill and loses a holdout kill is overfitted to the
 *   development set (Shi et al., "Evaluating Test-Suite Reduction in Real
 *   Software Evolution", ISSTA 2018).
 *
 * A mutant may put the reach probe at the marker REACH_MARKER of
 * testkit/lib/mutation.mjs in its replacement; without one the probe is
 * prefixed to the replacement where a statement may start.
 */
import { MUTANTS } from "./mutants.ts";

export type Contract = "semantic" | "host" | "representation";

export interface FaultModel {
  id: string;
  /** Which of the three contracts the claim belongs to. */
  contract: Contract;
  claim: string;
}

export interface AuditMutant {
  id: string;
  file: string;
  search: string;
  replace: string;
  fault: string;
  role: "development" | "holdout";
  /** A reverted fix: the finding and the commit that fixed it. */
  origin?: string;
}

export const FAULT_MODELS: readonly FaultModel[] = [
  {
    id: "producer-equality",
    contract: "semantic",
    claim:
      "A write equal to the current value under the comparator is not a change.",
  },
  {
    id: "stale-dependency",
    contract: "semantic",
    claim:
      "A successful pass keeps exactly the dependencies it read (INVARIANTS.md).",
  },
  {
    id: "evidence-strength",
    contract: "semantic",
    claim:
      "Transitive invalidation is validation evidence, not recompute evidence; a stable validation clears it (R8).",
  },
  {
    id: "single-delivery",
    contract: "host",
    claim:
      "A watcher obligation is handed to the host once while a queue or its own run owns it (R6, R10, F17).",
  },
  {
    id: "retained-delivery",
    contract: "host",
    claim:
      "An obligation retained during a run or a failed lifecycle reaches the host (R2, R9, L1, L5).",
  },
  {
    id: "list-symmetry",
    contract: "representation",
    claim:
      "Every live edge is linked in both its consumer's incoming and its producer's outgoing list (G1).",
  },
  {
    id: "cleanup-suffix",
    contract: "representation",
    claim:
      "Cleanup removes exactly the unvisited suffix after the cursor (tracking README).",
  },
  {
    id: "stamp-membership",
    contract: "representation",
    claim:
      "A stamp proves current-pass membership only for the current pass; the clock never repeats (R3, INV-T3).",
  },
  {
    id: "hint-lifetime",
    contract: "representation",
    claim: "A tracking hint never outlives its edge (R11, INV-H).",
  },
];

/** The fault model of each mutant of the oracle catalog. */
const DEVELOPMENT_FAULTS: Readonly<Record<string, string>> = {
  "push-transitive-overmark": "evidence-strength",
  "advance-skip-stale-cleanup": "stale-dependency",
  "write-skip-equality": "producer-equality",
  "pull-keep-unknown-on-stable-pop": "evidence-strength",
  "push-drop-computing-evidence": "retained-delivery",
  "push-once-redeliver-scheduled": "single-delivery",
  "push-redeliver-unknown-watcher": "single-delivery",
  "prefix-stamp-classification-false": "stamp-membership",
  "hint-keep-on-unlink": "hint-lifetime",
};

const HOLDOUT: readonly AuditMutant[] = [
  {
    id: "revert-f17-computing-guard",
    file: "src/kernel/stages/propagation/push_iterator_once.ts",
    search: "if ((state & (Scheduled | Computing)) !== 0) {",
    replace: "if ((state & Scheduled) !== 0) {",
    fault: "single-delivery",
    role: "holdout",
    origin: "F17",
  },
  {
    id: "revert-f15-retained-delivery",
    file: "src/kernel/engine/watcher.ts",
    search: "  if (undelivered) emitNodeInvalidated(node);",
    replace: "  void undelivered;",
    fault: "retained-delivery",
    role: "holdout",
    origin: "F15",
  },
  {
    id: "revert-f16-cleanup-recovery",
    file: "src/kernel/engine/watcher.ts",
    search:
      "// would then hide that dirty upstream from every later push.\n      recoverWatcherAfterComputationError(node);",
    replace:
      "// would then hide that dirty upstream from every later push.\n      recoverWatcherAfterError(node);",
    fault: "retained-delivery",
    role: "holdout",
    origin: "F16 (ab5ec15)",
  },
  {
    id: "revert-f13-rewinding-clock",
    file: "src/kernel/state.ts",
    search:
      "export function setTrackingStamp(epoch: number): void {\n  if (epoch > trackingStamp) trackingStamp = epoch;",
    replace:
      "export function setTrackingStamp(epoch: number): void {\n  /*REACH*/trackingStamp = epoch;",
    fault: "stamp-membership",
    role: "holdout",
    origin: "F13 (190a09e)",
  },
  {
    // The producer keeps a detached edge as its last outgoing edge, so the
    // next subscriber is linked after it and is unreachable from firstOut.
    id: "unlink-keep-stale-last-out",
    file: "src/kernel/shape/graph/sweepEdges.ts",
    search:
      "if (nextOut !== null) nextOut.prevOut = prevOut;\n    else from.lastOut = prevOut;",
    replace: "if (nextOut !== null) nextOut.prevOut = prevOut;",
    fault: "list-symmetry",
    role: "holdout",
  },
  {
    // Cleanup starts at the cursor instead of after it: the last read edge is
    // unlinked from its producer while the consumer still lists it.
    id: "cleanup-cut-at-cursor",
    file: "src/kernel/stages/tracking/cleanup.ts",
    search:
      "const firstUnvisitedEdge =\n    cursorEdge === null ? consumer.firstIn : cursorEdge.nextIn;",
    replace:
      "const firstUnvisitedEdge =\n    cursorEdge === null ? consumer.firstIn : cursorEdge;",
    fault: "cleanup-suffix",
    role: "holdout",
  },
];

export const AUDIT_MUTANTS: readonly AuditMutant[] = [
  ...MUTANTS.map(
    (mutant): AuditMutant => ({
      id: mutant.id,
      file: mutant.file,
      search: mutant.search,
      replace: mutant.replace,
      fault: DEVELOPMENT_FAULTS[mutant.id]!,
      role: "development",
    }),
  ),
  ...HOLDOUT,
];

/** Inventory errors: unknown fault models, unmapped or duplicate mutants. */
export function inventoryErrors(): string[] {
  const errors: string[] = [];
  const faults = new Set(FAULT_MODELS.map((fault) => fault.id));
  const ids = new Set<string>();
  for (const mutant of AUDIT_MUTANTS) {
    if (ids.has(mutant.id)) errors.push(`duplicate mutant ${mutant.id}`);
    ids.add(mutant.id);
    if (!faults.has(mutant.fault))
      errors.push(`mutant ${mutant.id} has unknown fault "${mutant.fault}"`);
  }
  for (const fault of faults)
    if (!AUDIT_MUTANTS.some((mutant) => mutant.fault === fault))
      errors.push(`fault model ${fault} has no mutant`);
  return errors;
}
