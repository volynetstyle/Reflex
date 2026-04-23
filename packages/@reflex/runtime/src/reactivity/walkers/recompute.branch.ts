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

function shouldRecomputeBranching(
  link: ReactiveEdge,
  consumer: ReactiveNode,
  stack: ReactiveEdge[],
  stackTop: number,
  stackBase: number,
): boolean {
  let changed = false;

  outer: while (true) {
    while (true) {
      if (consumer.state & Changed) {
        changed = true;
        break;
      }

      const dep = link.from,
        depState = dep.state;

      if (depState & Changed) {
        // Already-confirmed computed dependency: refresh and stop searching.
        changed = refreshAndPropagateIfNeeded(dep, hasFanout(link));
        break;
      }

      if (depState & Invalid) {
        const deps = dep.firstIn;
        if (deps !== null) {
          stack[stackTop++] = link;
          shouldRecomputeStackHigh = stackTop; //noteShouldRecomputeStackUsage(stackTop);
          link = deps;
          consumer = dep;

          if (deps.nextIn === null) {
            // Once inside a branching walk, many child arms collapse back into
            // a single-dependency chain. Run that tail linearly until the next
            // fork or terminal node instead of bouncing through the DFS loop.
            continue;
          }
          continue outer;
        }

        changed = refreshAndPropagateIfNeeded(dep, hasFanout(link));
        break;
      }

      // dep is already clean: mark consumer clean and keep descending linearly
      // while this arm stays single-dependency.
      consumer.state &= ~Invalid;
      const next = link.nextIn;
      if (next !== null) {
        link = next;
        continue outer;
      }

      if (stackTop === stackBase) {
        restoreShouldRecomputeStackBase(stack, stackBase);
        return false;
      }

      const parentLink = stack[--stackTop]!;
      shouldRecomputeStackHigh = stackTop;
      link = parentLink;
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
        if (deps.nextIn !== null) {
          // dep itself has multiple deps: escalate to DFS immediately.
          stack[stackTop++] = link;
          const result = shouldRecomputeBranching(
            deps,
            dep,
            stack,
            stackTop,
            stackBase,
          );
          shouldRecomputeStackHigh = stackTop; //noteShouldRecomputeStackUsage(stackTop);
          return result;
        }

        // Single dep of dep: continue descent on linear path.
        stack[stackTop++] = link;
        //noteShouldRecomputeStackUsage(stackTop);
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
    consumer.state &= ~Invalid;

    if (stackTop === stackBase) {
      // Stack empty: nothing changed anymore.
      restoreShouldRecomputeStackBase(stack, stackBase);
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
      changed = refreshAndPropagateIfNeeded(consumer, hasFanout(parentLink));
    } else {
      consumer.state &= ~Invalid;
    }

    consumer = parentLink.to;
  }

  if (!changed) consumer.state &= ~Invalid;

  // Explicit cleanup — replaces try/finally.
  restoreShouldRecomputeStackBase(stack, stackBase);
  return changed;
}
