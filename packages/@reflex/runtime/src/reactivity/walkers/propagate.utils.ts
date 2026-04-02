import type { ReactiveEdge } from "../shape";
import { DIRTY_STATE, ReactiveNodeState } from "../shape";

export function isTrackedPrefixEdge(
  edge: ReactiveEdge,
  depsTail: ReactiveEdge | null,
): boolean {
  if (depsTail === null) return false;
  if (edge === depsTail) return true;
  for (let cursor = edge.prevIn; cursor !== null; cursor = cursor.prevIn) {
    if (cursor === depsTail) return false;
  }
  return true;
}

// ─── getSlowInvalidatedSubscriberState ───────────────────────────────────────
//
// Hot-path fast check moved to call sites (see propagateBranching /
// propagateBranch). This function handles only the three slow-path cases.
//
// Inlining budget: ~20 AST nodes — will be inlined by all three JITs since
// both call sites are monomorphic (same edge/state shapes every time).

export function getSlowInvalidatedSubscriberState(
  edge: ReactiveEdge,
  state: number,
  promoteBit: number,
): number {
  if ((state & (DIRTY_STATE | ReactiveNodeState.Disposed)) !== 0) return 0;

  if ((state & ReactiveNodeState.Tracking) === 0) {
    return (state & ~ReactiveNodeState.Visited) | promoteBit;
  }

  return isTrackedPrefixEdge(edge, edge.to.depsTail)
    ? state | ReactiveNodeState.Visited | ReactiveNodeState.Invalid
    : 0;
}
