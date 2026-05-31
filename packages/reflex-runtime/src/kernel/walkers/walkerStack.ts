import type { ReactiveEdge } from "../shape";
import {
  noteShouldRecomputeStackUsage,
  readRuntimeWalkerStackStats,
  STACK_TRIM_MIN_CAPACITY,
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

//
export function getRecomputeStackBase(): number {
  return high;
}

//
export function setRecomputeStackHigh(top: number): void {
  high = top;
}

/**
 * Release the current walker slice and optionally trim retained capacity.
 */
//
export function releaseRecomputeStackBase(base: number): void {
  high = base;

  const len = stack.length;
  if (len >= STACK_TRIM_MIN_CAPACITY && base <= len >> 2) {
    stack.length = Math.max(base, STACK_TRIM_MIN_CAPACITY);
  }
}

//
export function pushRecomputeStack(edge: ReactiveEdge, top: number): number {
  stack[top++] = edge;
  if (__DEV__) noteShouldRecomputeStackUsage(top);
  return top;
}

//
export function readRecomputeStack(top: number): ReactiveEdge {
  return stack[top]!;
}

export function readShouldRecomputeStackStats(): {
  shouldRecompute: { current: number; peak: number; capacity: number };
  propagate: { current: number; peak: number; capacity: number };
} {
  return readRuntimeWalkerStackStats(high, stack.length, 0, 0);
}
