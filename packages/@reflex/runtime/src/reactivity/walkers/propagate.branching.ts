import { getDefaultContext } from "../context";
import type { ReactiveEdge } from "../shape";
import {
  NON_IMMEDIATE,
  SLOW_INVALIDATION_MASK,
  VISITED_MASK,
  WATCHER_MASK,
} from "./propagate.constants";
import { getSlowInvalidatedSubscriberState } from "./propagate.utils";
import {
  recordPropagation,
  notifyWatcherInvalidation,
} from "./propagation.watchers";

const propagateEdgeStack: ReactiveEdge[] = [];
const propagatePromoteStack: Uint32Array = new Uint32Array(512);

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
): unknown {
  const edgeStack = propagateEdgeStack;
  const promoteStack = propagatePromoteStack;
  const stackBase = edgeStack.length;
  let stackTop = stackBase;
  let promoteBit = NON_IMMEDIATE;
  const ctx = __DEV__ ? getDefaultContext() : undefined;

  if (resume !== null) {
    edgeStack[stackTop] = resume;
    promoteStack[stackTop++] = resumePromote;
  }

  resume = edge.nextOut;
  resumePromote = promoteBit;

  try {
    while (true) {
      const sub = edge.to;
      const state = sub.state;

      let nextState: number;

      if ((state & SLOW_INVALIDATION_MASK) === 0) {
        nextState = (state & ~VISITED_MASK) | promoteBit;
      } else {
        nextState = getSlowInvalidatedSubscriberState(edge, state, promoteBit);
      }

      if (nextState !== 0) {
        sub.state = nextState;

        if (__DEV__) {
          recordPropagation(edge, nextState, promoteBit, ctx!);
        }

        if ((nextState & WATCHER_MASK) !== 0) {
          thrown = notifyWatcherInvalidation(sub, thrown);
        } else {
          const firstOut = sub.firstOut;
          if (firstOut !== null) {
            if (resume !== null) {
              edgeStack[stackTop] = resume;
              promoteStack[stackTop++] = resumePromote;
            }

            edge = firstOut;
            promoteBit = NON_IMMEDIATE;
            resume = firstOut.nextOut;
            resumePromote = promoteBit;
            continue;
          }
        }
      }

      if (resume !== null) {
        edge = resume;
        promoteBit = resumePromote;
      } else if (stackTop > stackBase) {
        edge = edgeStack[--stackTop]!;
        promoteBit = promoteStack[stackTop]!;
      } else {
        return thrown;
      }

      resume = edge.nextOut;
      resumePromote = promoteBit;
    }
  } finally {
    edgeStack.length = stackBase;
  }
}
