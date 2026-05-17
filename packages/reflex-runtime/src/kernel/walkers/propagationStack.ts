import type { ReactiveEdge } from "../shape";
import {
  noteResumeEdgeStackUsage,
  readRuntimeWalkerStackStats,
  trimWalkerStackIfSparse,
} from "./walkerStackStats";

/**
 * Shared stack for push invalidation when propagation descends into branches.
 *
 * The stack stores the next outgoing edge to resume after a child branch has
 * been scanned. `resumeStackHigh` preserves the outer slice while watcher
 * callbacks or nested writes re-enter propagation.
 */
const resumeEdgeStack: ReactiveEdge[] = [];
let resumeStackHigh = 0;

// @__INLINE__
export function getPropagateStackBase(): number {
  return resumeStackHigh;
}

// @__INLINE__
export function setPropagateStackHigh(top: number): void {
  resumeStackHigh = top;
}

// @__INLINE__
export function pushPropagateStack(edge: ReactiveEdge, top: number): number {
  resumeEdgeStack[top++] = edge;
  noteResumeEdgeStackUsage(top);
  return top;
}

// @__INLINE__
export function readPropagateStack(top: number): ReactiveEdge {
  return resumeEdgeStack[top]!;
}

// @__INLINE__
export function restorePropagateStackBase(stackBase: number): void {
  resumeStackHigh = stackBase;
  trimWalkerStackIfSparse(resumeEdgeStack, stackBase);
}

export function readPropagateStackStats(): {
  shouldRecompute: { current: number; peak: number; capacity: number };
  propagate: { current: number; peak: number; capacity: number };
} {
  return readRuntimeWalkerStackStats(
    0,
    0,
    resumeStackHigh,
    resumeEdgeStack.length,
  );
}
