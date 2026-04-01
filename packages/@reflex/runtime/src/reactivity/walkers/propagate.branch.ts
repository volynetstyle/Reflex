import type { ExecutionContext } from "../context";
import type { ReactiveEdge } from "../shape";
import { ReactiveNodeState } from "../shape";
import {
  INVALIDATION_SLOW_PATH_MASK,
  NON_IMMEDIATE,
} from "./propagate.constants";
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
// Promotion fix: when escalating, `promote` (not hardcoded NON_IMMEDIATE) is
// passed as `resumePromote` so the sibling `next` stays in the correct
// promotion zone. The child level (firstOut) still resets to NON_IMMEDIATE.
export function propagateBranch(
  edge: ReactiveEdge,
  promote: number,
  thrown: unknown,
  context: ExecutionContext,
): unknown {
  while (true) {
    const sub = edge.to;
    const state = sub.state;
    const nextState =
      (state & INVALIDATION_SLOW_PATH_MASK) === 0
        ? state |
          (promote ? ReactiveNodeState.Changed : ReactiveNodeState.Invalid)
        : getSlowInvalidatedSubscriberState(edge, state, promote);
    const next = edge.nextOut;

    if (nextState) {
      sub.state = nextState;
      if (__DEV__) recordPropagation(edge, nextState, promote, context);

      if ((nextState & ReactiveNodeState.Watcher) !== 0) {
        thrown = notifyWatcherInvalidation(sub, thrown, context);
      } else {
        const firstOut = sub.firstOut;
        if (firstOut !== null) {
          if (next !== null) {
            return propagateBranching(
              firstOut,
              NON_IMMEDIATE,
              next,
              promote,
              thrown,
              context,
            );
          }

          edge = firstOut;
          promote = NON_IMMEDIATE;
          continue;
        }
      }
    }

    if (next === null) return thrown;
    edge = next;
    // promote stays the same: siblings at the same level share promotion status
  }
}
