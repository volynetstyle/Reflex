// Keep the recompute + sideways propagation protocol in one tiny helper.
// Production Rollup/Terser builds inline this at annotated walker call-sites.

import { recompute } from "../engine/recompute";
import type { ReactiveNode } from "../shape";
import { propagateOnce, propagateOnceFromEdgeNonNull } from "./propagateOnce";

/**
 * Recompute `node` and, if it changed, propagate dirtiness to its outgoing users.
 *
 * The active pull walker owns the current parent edge; this only propagates
 * side-fanout that existed before recompute.
 */
// @__INLINE__
export function refresh(node: ReactiveNode): boolean {
  const firstOut = node.firstOut;
  const changed = recompute(node);

  if (!changed || firstOut === null) {
    return changed;
  }

  propagateOnceFromEdgeNonNull(firstOut);
  return true;
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
