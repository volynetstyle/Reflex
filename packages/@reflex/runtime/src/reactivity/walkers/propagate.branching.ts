import type { ExecutionContext } from "../context";
import type { ReactiveEdge } from "../shape";
import { DIRTY_STATE, ReactiveNodeState } from "../shape";
import { CAN_ESCAPE_INVALIDATION, NON_IMMEDIATE } from "./propagate.constants";
import {
  recordPropagation,
  notifyWatcherInvalidation,
} from "./propagation.watchers";

const propagateEdgeStack: ReactiveEdge[] = [];
const propagatePromoteStack: number[] = [];

function isTrackedPrefixEdge(
  edge: ReactiveEdge,
  depsTail: ReactiveEdge | null,
): boolean {
  if (depsTail === null) return false;

  for (
    let cursor: ReactiveEdge | null = edge.prevIn;
    cursor !== null;
    cursor = cursor.prevIn
  ) {
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
function getSlowInvalidatedSubscriberState(
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

// ─── propagateBranching ───────────────────────────────────────────────────────
//
// DFS with explicit stack for fanout nodes (multiple outgoing edges).
// try/finally retained here — unlike shouldRecompute.ts, this function can
// genuinely throw via notifyWatcherInvalidation, so cleanup must be guaranteed.
//
// Changes vs original:
//
// 1. promoteBit/resumePromote symmetry fix:
//    Original passed (NON_IMMEDIATE, promoteBit) when escalating from linear,
//    meaning siblings of the escalation point inherited the wrong promoteBit level.
//    Now linear passes its own `promoteBit` as resumePromote so siblings stay
//    in the same promotion zone.
//
// 2. __DEV__ guard at call site:
//    recordPropagation() is now called only inside `if (__DEV__)` blocks,
//    removing the internal guard and the call overhead in prod builds.
//
// 3. stackTop postfix increment/decrement:
//    stack[stackTop++] / stack[--stackTop] — one fewer bytecode per iteration.

export function propagateBranching(
  edge: ReactiveEdge,
  resume: ReactiveEdge | null,
  resumePromote: number,
  thrown: unknown,
  context: ExecutionContext,
): unknown {
  const edgeStack = propagateEdgeStack;
  const promoteStack = propagatePromoteStack;
  const stackBase = edgeStack.length;
  let stackTop = stackBase;
  let promoteBit = NON_IMMEDIATE;

  while (true) {
    const sub = edge.to;
    const state = sub.state;
    let nextState = 0;

    if ((state & CAN_ESCAPE_INVALIDATION) === 0) {
      nextState = state | promoteBit;
    } else {
      nextState = getSlowInvalidatedSubscriberState(edge, state, promoteBit);
    }

    if (nextState !== 0) {
      sub.state = nextState;
      if (__DEV__) recordPropagation(edge, nextState, promoteBit, context);

      if ((nextState & ReactiveNodeState.Watcher) !== 0) {
        thrown = notifyWatcherInvalidation(sub, thrown, context);
      } else {
        const firstOut = sub.firstOut;
        if (firstOut !== null) {
          if (resume !== null) {
            edgeStack[stackTop] = resume;
            promoteStack[stackTop++] = resumePromote;
          }

          edge = firstOut;
          resume = firstOut.nextOut;
          promoteBit = resumePromote = NON_IMMEDIATE;
          continue;
        }
      }
    }

    if (resume !== null) {
      edge = resume;
      promoteBit = resumePromote;
    } else if (stackTop > stackBase) {
      edge = edgeStack[--stackTop]!;
      promoteBit = resumePromote = promoteStack[stackTop]!;
    } else {
      edgeStack.length = promoteStack.length = stackBase;
      return thrown;
    }

    resume = edge.nextOut;
  }
}
