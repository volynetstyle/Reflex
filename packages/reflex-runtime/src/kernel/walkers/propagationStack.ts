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

export function getPropagateStackBase(): number {
  return resumeStackHigh;
}

export function setPropagateStackHigh(top: number): void {
  resumeStackHigh = top;
}

export function pushPropagateStack(edge: ReactiveEdge, top: number): number {
  resumeEdgeStack[top++] = edge;
  noteResumeEdgeStackUsage(top);
  return top;
}

export function readPropagateStack(top: number): ReactiveEdge {
  return resumeEdgeStack[top]!;
}

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

