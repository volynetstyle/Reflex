// Keep the recompute + sideways propagation protocol in one tiny helper.
// Production Rollup/Terser builds inline this at annotated walker call-sites.

import { recompute } from "../engine/computeNode";
import type { ReactiveNode } from "../shape";
import { propagateOnce, propagateOnceFromEdge } from "./propagateOnce";

/**
 * Recompute `node` and, if it changed, propagate dirtiness to its outgoing users.
 *
 * The active pull walker owns the current parent edge; this only propagates
 * side-fanout that existed before recompute.
 */
// @__INLINE__
export function refresh(node: ReactiveNode): boolean {
  const firstOut = node.firstOut;
  const hasSideFanoutBeforeRecompute =
    firstOut !== null && firstOut.nextOut !== null;
  const changed = recompute(node);

  // Keep this exact semantic:
  // the current parent path is handled by the walker;
  // only side-fanout needs explicit propagation.
  if (changed && hasSideFanoutBeforeRecompute) {
    propagateOnceFromEdge(firstOut);
  }

  return changed;
}

export function refreshAndPropagateIfNeeded(
  node: ReactiveNode,
  shouldPropagate: boolean,
): boolean {
  const changed = recompute(node);

  if (changed && shouldPropagate) {
    propagateOnce(node);
  }

  return changed;
}
