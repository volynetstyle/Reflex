// ─── shouldRecomputeLinear ────────────────────────────────────────────────────
//
// Fast path: walks a chain where every node has exactly one dependency.
// Stays allocation-free and branch-minimised for the common case.
//
// try/finally removed intentionally:
//   - JSC and SpiderMonkey refuse to inline functions containing try/finally.
//   - TurboFan creates a separate deopt frame for the finally block even when
//     the path is exception-free, adding hidden overhead.
//   - Instead, every return site restores stack.length explicitly. This is
//     safe because shouldRecomputeLinear is the only writer for indices
//     [stackBase, stackTop).
//
// The function never throws (all inputs are typed, no user callbacks here),

import type { ReactiveNode, ReactiveEdge } from "../shape";
import { ReactiveNodeState, DIRTY_STATE } from "../shape";
import { shouldRecomputeBranching } from "./recompute.branching";
import { refreshRecompute } from "./recompute.refresh";

// Shared stack — reused across calls to avoid allocation.
// stackBase tracks the logical bottom per call so recursive entries
// don't trample each other's frames.
const shouldRecomputeStack: ReactiveEdge[] = [];

// so the finally was only cleanup — moving it inline is correct.
export function shouldRecomputeLinear(
  node: ReactiveNode,
  firstIn: ReactiveEdge,
): boolean {
  const stack = shouldRecomputeStack;
  const stackBase = stack.length;
  let stackTop = stackBase;
  let link = firstIn;
  let consumer = node;
  let changed = false;

  while (true) {
    if (link.nextIn !== null) {
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
      changed = refreshRecompute(link, dep);

      if (changed || link.nextIn === null) break;
    }

    if ((depState & DIRTY_STATE) !== 0) {
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
          // Branching already restored stack down to stackBase on its own
          // return path, but we pushed one extra entry before calling it.
          // Restore here to keep invariant: stack.length === stackBase on exit.
          stack.length = stackBase;
          return result;
        }

        // Single dep of dep: continue descent on linear path.
        stack[stackTop++] = link;
        link = deps;
        consumer = dep;
        continue;
      }

      changed = refreshRecompute(link, dep);
      break;
    }

    // dep is clean: mark consumer clean too.
    consumer.state &= ~ReactiveNodeState.Invalid;

    if (stackTop === stackBase) {
      // Stack empty: nothing changed anymore.
      return false;
    }

    link = stack[--stackTop]!;
    consumer = link.to;
  }

  // Unwind: propagate the change (or clean) decision up the stack.
  while (stackTop > stackBase) {
    const parentLink = stack[--stackTop]!;

    if (changed) {
      changed = refreshRecompute(parentLink, consumer);
    } else {
      consumer.state &= ~ReactiveNodeState.Invalid;
    }

    consumer = parentLink.to;
  }

  if (!changed) consumer.state &= ~ReactiveNodeState.Invalid;

  // Explicit cleanup — replaces try/finally.
  stack.length = stackBase;
  return changed;
}

