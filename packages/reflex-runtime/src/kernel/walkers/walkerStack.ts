import type { ReactiveEdge, ReactiveNode } from "../shape";
import { Invalid } from "../shape";
import {
  noteShouldRecomputeStackUsage,
  readRuntimeWalkerStackStats,
  trimWalkerStackIfSparse,
} from "./walkerStackStats";

/**
 * Shared pull-walker traversal stack.
 *
 * The stack is intentionally module-scoped to avoid allocating during every
 * read. `high` marks the top slice currently owned by the outermost active
 * walk, so nested reads can borrow the same backing array safely.
 */
const stack: ReactiveEdge[] = [];
let high = 0;

export function getRecomputeStackBase(): number {
  return high;
}

export function setRecomputeStackHigh(top: number): void {
  high = top;
}

/**
 * Reset the current walker slice without trimming capacity.
 *
 * Used by `walkLine` when it bails into `walkBranch`; the fallback may reuse
 * the same stack immediately.
 */
export function resetRecomputeStackBase(base: number): void {
  high = base;
}

/**
 * Release the current walker slice and optionally trim retained capacity.
 */
export function releaseRecomputeStackBase(base: number): void {
  high = base;
  trimWalkerStackIfSparse(stack, base);
}

export function pushRecomputeStack(edge: ReactiveEdge, top: number): number {
  stack[top++] = edge;
  if (__DEV__) noteShouldRecomputeStackUsage(top);
  return top;
}

export function readRecomputeStack(top: number): ReactiveEdge {
  return stack[top]!;
}

/**
 * Clear Invalid on the current node and all nodes collected on the stack slice.
 *
 * Used when the pull walk proves the inspected dependency path is clean.
 */
export function clearInvalid(
  node: ReactiveNode,
  top: number,
  base: number,
): void {
  node.state &= ~Invalid;

  while (top > base) {
    const sub = stack[--top]!.to;
    sub.state &= ~Invalid;
  }

  releaseRecomputeStackBase(base);
}

export function readShouldRecomputeStackStats(): {
  shouldRecompute: { current: number; peak: number; capacity: number };
  propagate: { current: number; peak: number; capacity: number };
} {
  return readRuntimeWalkerStackStats(high, stack.length, 0, 0);
}
