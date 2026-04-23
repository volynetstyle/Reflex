// ─── recompute refresh seam ──────────────────────────────────────────────────
//
// Keep the recompute + sideways propagation protocol in one tiny helper so the
// hot pull walkers can reuse a stable call site instead of re-inlining the
// same branchy block at every exit.

import { recompute } from "../engine/compute";
import type { ReactiveEdge, ReactiveNode } from "../shape";
import { propagateOnce } from "./propagate.once";

export function hasFanout(edge: ReactiveEdge): boolean {
  return edge.from.outDegree > 1;
}

export function refreshAndPropagateIfNeeded(
  node: ReactiveNode,
  fanout: boolean,
): boolean {
  const changed = recompute(node);

  if (changed && fanout) {
    propagateOnce(node);
  }

  return changed;
}
