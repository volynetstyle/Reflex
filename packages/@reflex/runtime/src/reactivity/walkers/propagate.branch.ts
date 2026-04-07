import { getDefaultContext} from "../context";
import type { ReactiveEdge } from "../shape";
import {  NON_IMMEDIATE, SLOW_INVALIDATION_MASK, VISITED_MASK, WATCHER_MASK } from "./propagate.constants";
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
  const ctx = __DEV__ ? getDefaultContext() : undefined;

  while (true) {
    const sub = edge.to;
    const state = sub.state;
    const next = edge.nextOut;

    let nextState: number;

    // Сверхдешёвый путь:
    // обычный узел, не dirty, не disposed, не tracking.
    // Visited не считаем blocker'ом.
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

    if (next === null) {
      return thrown;
    }

    edge = next;
    // sibling остаётся в той же promotion zone
  }
}