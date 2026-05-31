// Keep the recompute + sideways propagation protocol in one tiny helper.
// Production Rollup/Terser builds inline this at annotated walker call-sites.

import { recompute } from "../engine/recompute";
import type { ReactiveNode } from "../shape";
import { propagateOnce, propagateOnceFromEdge } from "./propagateOnce";

/**
 * Advance to next value
 * 
 * Recompute `node` and, if it changed, propagate dirtiness to its outgoing users.
 *
 * The active pull walker owns the current parent edge; this only propagates
 * side-fanout that existed before recompute.
 */
// 
export function advance(node: ReactiveNode): boolean {
  const firstOut = node.firstOut;

  if (recompute(node)) return (propagateOnceFromEdge(firstOut), true);

  return false;
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
