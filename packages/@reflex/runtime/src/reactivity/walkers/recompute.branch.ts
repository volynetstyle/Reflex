// ─── shouldRecomputeWalk ──────────────────────────────────────────────────────
//
// Unified pull walker for both linear chains and branching graphs.
// Keeps the same allocation-free shared stack contract while preserving
// a tight inner loop for single-dependency stretches inside the walk.
//
// try/finally removed intentionally:
//   - JSC and SpiderMonkey refuse to inline functions containing try/finally.
//   - TurboFan creates a separate deopt frame for the finally block even when
//     the path is exception-free, adding hidden overhead.
//   - Instead, every return site restores the shared stack high-water mark. This is
//     safe because these pull walkers own the slice [stackBase, stackTop) and
//     every exit path restores it before returning.
//
// The function never throws (all inputs are typed, no user callbacks here),

import type { ReactiveNode, ReactiveEdge } from "../shape";
import { Changed, Invalid } from "../shape";
import { hasFanout, refreshAndPropagateIfNeeded } from "./recompute.refresh";
import {
  readRuntimeWalkerStackStats,
  resetRuntimeWalkerStackStats,
  trimWalkerStackIfSparse,
} from "./stack.stats";

// Shared stack — reused across calls to avoid allocation.
// stackBase tracks the logical bottom per call so recursive entries
// don't trample each other's frames.
const shouldRecomputeStack: ReactiveEdge[] = [];
let shouldRecomputeStackHigh = 0;

export function readShouldRecomputeStackStats(): {
  shouldRecompute: { current: number; peak: number; capacity: number };
  propagate: { current: number; peak: number; capacity: number };
} {
  return readRuntimeWalkerStackStats(
    shouldRecomputeStackHigh,
    shouldRecomputeStack.length,
    0,
    0,
  );
}

export function resetShouldRecomputeStackStats(): void {
  resetRuntimeWalkerStackStats();
}

function restoreShouldRecomputeStackBase(
  stack: ReactiveEdge[],
  stackBase: number,
): void {
  shouldRecomputeStackHigh = stackBase;
  trimWalkerStackIfSparse(stack, stackBase);
}

export function shouldRecomputeWalk(
  node: ReactiveNode,
  firstIn: ReactiveEdge,
): boolean {
  const stack = shouldRecomputeStack;
  const stackBase = shouldRecomputeStackHigh;
  let stackTop = stackBase;
  let link = firstIn;
  let consumer = node;
  let changed = false;

  outer: do {
    while (true) {
      if (consumer.state & Changed) {
        changed = true;
        break;
      }

      const dep = link.from;
      const depState = dep.state;

      if (depState & Changed) {
        changed = refreshAndPropagateIfNeeded(dep, hasFanout(link));
        break;
      }

      if (depState & Invalid) {
        const deps = dep.firstIn;
        if (deps !== null) {
          stack[stackTop++] = link;
          shouldRecomputeStackHigh = stackTop;
          link = deps;
          consumer = dep;
          continue outer;
        }

        changed = refreshAndPropagateIfNeeded(dep, hasFanout(link));
        break;
      }

      const next = link.nextIn;
      if (next !== null) {
        link = next;
        continue outer;
      }

      consumer.state &= ~Invalid;

      if (stackTop === stackBase) {
        restoreShouldRecomputeStackBase(stack, stackBase);
        return false;
      }

      const parentLink = stack[--stackTop]!;
      shouldRecomputeStackHigh = stackTop;
      consumer = parentLink.to;

      const parentNext = parentLink.nextIn;
      if (parentNext !== null) {
        link = parentNext;
        continue outer;
      }
    }

    if (!changed) {
      const next = link.nextIn;
      if (next !== null) {
        link = next;
        continue;
      }

      consumer.state &= ~Invalid;
    }

    while (stackTop > stackBase) {
      const parentLink = stack[--stackTop]!;
      shouldRecomputeStackHigh = stackTop;

      if (changed) {
        changed = refreshAndPropagateIfNeeded(consumer, hasFanout(parentLink));
      } else {
        consumer.state &= ~Invalid;
      }

      consumer = parentLink.to;

      if (!changed) {
        const next = parentLink.nextIn;
        if (next !== null) {
          link = next;
          continue outer;
        }
      }
    }

    restoreShouldRecomputeStackBase(stack, stackBase);
    return changed;
  } while (true);
}