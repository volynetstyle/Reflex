// ─── shouldRecomputeLinear ────────────────────────────────────────────────────
//
// Fast path: walks a chain where every node has exactly one dependency.
// Stays allocation-free and branch-minimised for the common case.
//
// try/finally removed intentionally:
//   - JSC and SpiderMonkey refuse to inline functions containing try/finally.
//   - TurboFan creates a separate deopt frame for the finally block even when
//     the path is exception-free, adding hidden overhead.
//   - Instead, every return site clears its reserved slice explicitly.
//     This is safe because shouldRecomputeLinear is the only writer for indices
//     [stackBase, stackTop).
//
// The function never throws (all inputs are typed, no user callbacks here),

import type { ReactiveNode, ReactiveEdge } from "../shape";
import { ReactiveNodeState, DIRTY_STATE } from "../shape";
import { recompute } from "../engine/compute";
import { propagateOnce } from "./propagate.once";

// Shared stack — reused across calls to avoid allocation.
// stackBase tracks the logical bottom per call so recursive entries
// don't trample each other's frames.
const shouldRecomputeStack: ReactiveEdge[] = [];
let shouldRecomputeStackTop = 0;

function shouldRecomputeBranching(
  link: ReactiveEdge,
  consumer: ReactiveNode,
  stack: ReactiveEdge[],
  stackTop: number,
  stackBase: number,
): boolean {
  let stackHigh = stackTop;
  let changed = false;

  outer: while (true) {
    if ((consumer.state & ReactiveNodeState.Changed) !== 0) {
      changed = true;
    } else {
      const dep = link.from;
      const depState = dep.state;

      if ((depState & ReactiveNodeState.Changed) !== 0) {
        // Already-confirmed computed dependency: refresh and stop searching.
        shouldRecomputeStackTop = stackTop;
        changed = recompute(dep);
        if (changed && (link.prevOut !== null || link.nextOut !== null)) {
          propagateOnce(dep);
        }
      } else if ((depState & DIRTY_STATE) !== 0) {
        const deps = dep.firstIn;
        if (deps !== null) {
          stack[stackTop++] = link;
          if (stackTop > stackHigh) stackHigh = stackTop;
          link = deps;
          consumer = dep;
          continue;
        }

        shouldRecomputeStackTop = stackTop;
        changed = recompute(dep);
        if (changed && (link.prevOut !== null || link.nextOut !== null)) {
          propagateOnce(dep);
        }
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

      if (changed) {
        shouldRecomputeStackTop = stackTop;
        changed = recompute(consumer);
        if (
          changed &&
          (parentLink.prevOut !== null || parentLink.nextOut !== null)
        ) {
          propagateOnce(consumer);
        }
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

    while (stackHigh > stackBase) {
      stack[--stackHigh] = undefined!;
    }
    shouldRecomputeStackTop = stackBase;
    return changed;
  }
}

// so the finally was only cleanup — moving it inline is correct.
export function shouldRecomputeLinear(
  node: ReactiveNode,
  firstIn: ReactiveEdge,
): boolean {
  const stack = shouldRecomputeStack;
  const stackBase = shouldRecomputeStackTop;
  let stackTop = stackBase;
  let stackHigh = stackTop;
  let link = firstIn;
  let consumer = node;
  let changed = false;

  while (true) {
    const nextIn = link.nextIn;

    if (nextIn !== null) {
      // Multiple deps at this level: hand off to DFS.
      // Stack ownership transfers — branching will pop down to stackBase.
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
      shouldRecomputeStackTop = stackTop;
      changed = recompute(dep);
      if (changed && (link.prevOut !== null || link.nextOut !== null)) {
        propagateOnce(dep);
      }
      break;
    }

    if ((depState & DIRTY_STATE) !== 0) {
      const deps = dep.firstIn;
      if (deps !== null) {
        if (deps.nextIn !== null) {
          // dep itself has multiple deps: escalate to DFS immediately.
          stack[stackTop++] = link;
          if (stackTop > stackHigh) stackHigh = stackTop;
          const result = shouldRecomputeBranching(
            deps,
            dep,
            stack,
            stackTop,
            stackBase,
          );
          return result;
        }

        // Single dep of dep: continue descent on linear path.
        stack[stackTop++] = link;
        if (stackTop > stackHigh) stackHigh = stackTop;
        link = deps;
        consumer = dep;
        continue;
      }

      shouldRecomputeStackTop = stackTop;
      changed = recompute(dep);
      if (changed && (link.prevOut !== null || link.nextOut !== null)) {
        propagateOnce(dep);
      }
      break;
    }

    // dep is clean: mark consumer clean too.
    consumer.state &= ~ReactiveNodeState.Invalid;

    if (stackTop === stackBase) {
      // Stack empty: nothing changed anymore.
      while (stackHigh > stackBase) {
        stack[--stackHigh] = undefined!;
      }
      shouldRecomputeStackTop = stackBase;
      return false;
    }

    link = stack[--stackTop]!;
    consumer = link.to;
  }

  // Unwind: propagate the change (or clean) decision up the stack.
  while (stackTop > stackBase) {
    const parentLink = stack[--stackTop]!;

    if (changed) {
      shouldRecomputeStackTop = stackTop;
      changed = recompute(consumer);
      if (
        changed &&
        (parentLink.prevOut !== null || parentLink.nextOut !== null)
      ) {
        propagateOnce(consumer);
      }
    } else {
      consumer.state &= ~ReactiveNodeState.Invalid;
    }

    consumer = parentLink.to;
  }

  if (!changed) consumer.state &= ~ReactiveNodeState.Invalid;

  // Explicit cleanup — replaces try/finally.
  while (stackHigh > stackBase) {
    stack[--stackHigh] = undefined!;
  }
  shouldRecomputeStackTop = stackBase;
  return changed;
}
