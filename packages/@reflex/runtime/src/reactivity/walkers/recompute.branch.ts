// ─── shouldRecomputeLinear ────────────────────────────────────────────────────
//
// Fast path: walks a chain where every node has exactly one dependency.
// Stays allocation-free and branch-minimised for the common case.
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
import { ReactiveNodeState, DIRTY_STATE } from "../shape";
import { hasFanout, refreshAndPropagateIfNeeded } from "./recompute.refresh";

// Shared stack — reused across calls to avoid allocation.
// stackBase tracks the logical bottom per call so recursive entries
// don't trample each other's frames.
const shouldRecomputeStack: ReactiveEdge[] = [];
let shouldRecomputeStackHigh = 0;

function shouldRecomputeBranching(
  link: ReactiveEdge,
  consumer: ReactiveNode,
  stack: ReactiveEdge[],
  stackTop: number,
  stackBase: number,
): boolean {
  let changed = false;

  outer: while (true) {
    if ((consumer.state & ReactiveNodeState.Changed) !== 0) {
      changed = true;
    } else {
      const dep = link.from;
      const depState = dep.state;

      if ((depState & ReactiveNodeState.Changed) !== 0) {
        // Already-confirmed computed dependency: refresh and stop searching.
        shouldRecomputeStackHigh = stackTop;
        changed = refreshAndPropagateIfNeeded(dep, hasFanout(link));
      } else if ((depState & DIRTY_STATE) !== 0) {
        const deps = dep.firstIn;
        if (deps !== null) {
          stack[stackTop++] = link;
          shouldRecomputeStackHigh = stackTop;
          link = deps;
          consumer = dep;
          continue;
        }

        shouldRecomputeStackHigh = stackTop;
        changed = refreshAndPropagateIfNeeded(dep, hasFanout(link));
      }
    }

    if (!changed) {
      const next = link.nextIn;
      if (next !== null) {
        link = next;
        continue;
      }
      consumer.state &= ~ReactiveNodeState.Invalid;
    }

    while (stackTop > stackBase) {
      const parentLink = stack[--stackTop]!;
      shouldRecomputeStackHigh = stackTop;

      if (changed) {
        shouldRecomputeStackHigh = stackTop;
        changed = refreshAndPropagateIfNeeded(consumer, hasFanout(parentLink));
      } else {
        consumer.state &= ~ReactiveNodeState.Invalid;
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

    shouldRecomputeStackHigh = stackBase;
    return changed;
  }
}

// so the finally was only cleanup — moving it inline is correct.
export function shouldRecomputeLinear(
  node: ReactiveNode,
  firstIn: ReactiveEdge,
): boolean {
  const stack = shouldRecomputeStack;
  const stackBase = shouldRecomputeStackHigh;
  let stackTop = stackBase;
  let link = firstIn;
  let consumer = node;
  let changed = false;

  while (true) {
    const nextIn = link.nextIn;

    if (nextIn !== null) {
      // Multiple deps at this level: hand off to DFS.
      // Stack ownership transfers — branching restores stack.length itself.
      return shouldRecomputeBranching(
        link,
        consumer,
        stack,
        stackTop,
        stackBase,
      );
    }

    if ((consumer.state & ReactiveNodeState.Changed) !== 0) {
      changed = true;
      break;
    }

    const dep = link.from;
    const depState = dep.state;

    if ((depState & ReactiveNodeState.Changed) !== 0) {
      shouldRecomputeStackHigh = stackTop;
      changed = refreshAndPropagateIfNeeded(dep, hasFanout(link));
      break;
    }

    if ((depState & DIRTY_STATE) !== 0) {
      const deps = dep.firstIn;
      if (deps !== null) {
        if (deps.nextIn !== null) {
          // dep itself has multiple deps: escalate to DFS immediately.
          stack[stackTop++] = link;
          shouldRecomputeStackHigh = stackTop;
          return shouldRecomputeBranching(
            deps,
            dep,
            stack,
            stackTop,
            stackBase,
          );
        }

        // Single dep of dep: continue descent on linear path.
        stack[stackTop++] = link;
        shouldRecomputeStackHigh = stackTop;
        link = deps;
        consumer = dep;
        continue;
      }

      shouldRecomputeStackHigh = stackTop;
      changed = refreshAndPropagateIfNeeded(dep, hasFanout(link));
      break;
    }

    // dep is clean: mark consumer clean too.
    consumer.state &= ~ReactiveNodeState.Invalid;

    if (stackTop === stackBase) {
      // Stack empty: nothing changed anymore.
      shouldRecomputeStackHigh = stackBase;
      return false;
    }

    link = stack[--stackTop]!;
    shouldRecomputeStackHigh = stackTop;
    consumer = link.to;
  }

  // Unwind: propagate the change (or clean) decision up the stack.
  while (stackTop > stackBase) {
    const parentLink = stack[--stackTop]!;
    shouldRecomputeStackHigh = stackTop;

    if (changed) {
      shouldRecomputeStackHigh = stackTop;
      changed = refreshAndPropagateIfNeeded(consumer, hasFanout(parentLink));
    } else {
      consumer.state &= ~ReactiveNodeState.Invalid;
    }

    consumer = parentLink.to;
  }

  if (!changed) consumer.state &= ~ReactiveNodeState.Invalid;

  // Explicit cleanup — replaces try/finally.
  shouldRecomputeStackHigh = stackBase;
  return changed;
}
