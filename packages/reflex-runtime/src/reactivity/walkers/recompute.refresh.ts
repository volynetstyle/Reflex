// ─── recompute refresh seam ──────────────────────────────────────────────────
//
// Keep the recompute + sideways propagation protocol in one tiny helper so the
// hot pull walkers can reuse a stable call site instead of re-inlining the
// same branchy block at every exit.

import { recompute } from "../engine/compute";
import type { ReactiveEdge, ReactiveNode } from "../shape";
import { propagateOnce } from "./propagate.once";

function hasSideFanout(node: ReactiveNode): boolean {
  return node.firstOut !== node.lastOut;
}

function assertRefreshEdge(node: ReactiveNode, edge: ReactiveEdge): void {
  if (!__DEV__) return;

  if (edge.from !== node) {
    throw new Error("refresh invariant violation: edge.from !== node");
  }

  for (let cursor = node.firstOut; cursor !== null; cursor = cursor.nextOut) {
    if (cursor === edge) return;
  }

  throw new Error("refresh invariant violation: edge is not attached out");
}

/**
 * Recompute `node` and, if it changed, propagate dirtiness to its outgoing users.
 *
 * `edge` must be an outgoing edge from `node`.
 */
export function refresh(node: ReactiveNode, edge: ReactiveEdge): boolean {
  assertRefreshEdge(node, edge);

  const changed = recompute(node);

  // Keep this exact semantic:
  // the current parent path is handled by the walker;
  // only side-fanout needs explicit propagation.
  if (changed && hasSideFanout(node)) {
    propagateOnce(node);
  }

  return changed;
}
