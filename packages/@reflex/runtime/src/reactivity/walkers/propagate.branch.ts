import { getDefaultContext} from "../context";
import type { ReactiveEdge } from "../shape";
import { ReactiveNodeState } from "../shape";
import { CAN_ESCAPE_INVALIDATION, NON_IMMEDIATE } from "./propagate.constants";
import { propagateBranching } from "./propagate.branching";
import { getSlowInvalidatedSubscriberState } from "./propagate.utils";
import {
  recordPropagation,
  notifyWatcherInvalidation,
} from "./propagation.watchers";

// ─── propagateBranch ──────────────────────────────────────────────────────────
//
// Hot path: tight loop for chains with no fanout.
// Escalates to propagateBranching the moment a sibling edge appears.
//
// Promotion fix: when escalating, `promoteBit` (not hardcoded NON_IMMEDIATE) is
// passed as `resumePromote` so the sibling `next` stays in the correct
// promotion zone. The child level (firstOut) still resets to NON_IMMEDIATE.
export function propagateBranch(
  edge: ReactiveEdge,
  promoteBit: number,
  thrown: unknown,
): unknown {
  while (true) {
    const sub = edge.to;
    const state = sub.state;
    let nextState = 0;

    if ((state & CAN_ESCAPE_INVALIDATION) === 0) {
      nextState = state | promoteBit;
    } else {
      nextState = getSlowInvalidatedSubscriberState(edge, state, promoteBit);
    }

    const next = edge.nextOut;

    if (nextState) {
      sub.state = nextState;
      if (__DEV__) recordPropagation(edge, nextState, promoteBit, getDefaultContext());

      if ((nextState & ReactiveNodeState.Watcher) !== 0) {
        thrown = notifyWatcherInvalidation(sub, thrown);
      } else {
        const firstOut = sub.firstOut;
        if (firstOut !== null) {
          if (next !== null) {
            return propagateBranching(
              firstOut,
              next,
              promoteBit,
              thrown,
            );
          }

          edge = firstOut;
          promoteBit = NON_IMMEDIATE;
          continue;
        }
      }
    }

    if (next === null) return thrown;
    edge = next;
    // promoteBit stays the same: siblings at the same level share promotion status
  }
}
