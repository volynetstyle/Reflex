import { recordDebugEvent } from "../../debug";
import { defaultContext } from "../context";
import { devAssertPropagateAlive } from "../dev";
import { DIRTY_STATE, type ReactiveEdge, ReactiveNodeState } from "../shape";
import { propagateBranching } from "./propagate.branching";
import {
  DISPOSED_MASK,
  IMMEDIATE,
  NON_IMMEDIATE,
  SLOW_INVALIDATION_MASK,
  TRACKING_MASK,
  VISITED_MASK,
  WATCHER_MASK,
} from "./propagate.constants";

export function propagate(
  startEdge: ReactiveEdge,
  promoteImmediate: number = NON_IMMEDIATE,
): void {
  if ((startEdge.from.state & ReactiveNodeState.Disposed) !== 0) {
    if (__DEV__) devAssertPropagateAlive();
    return;
  }

  const context = defaultContext;
  const dispatch = context.effectInvalidatedDispatch;
  let edge = startEdge;
  let promoteBit = promoteImmediate;
  let thrown: unknown = null;

  while (true) {
    const sub = edge.to;
    const nextSub = edge.nextOut;
    const subState = sub.state;

    let nextState: number;

    if ((subState & SLOW_INVALIDATION_MASK) === 0) {
      nextState = (subState & ~VISITED_MASK) | promoteBit;
    } else if ((subState & DISPOSED_MASK) !== 0) {
      nextState = 0;
    } else if ((subState & TRACKING_MASK) !== 0) {
      let depsTail = null;

      if ((depsTail = sub.depsTail) === null) {
        nextState = 0;
      } else if (edge === depsTail) {
        nextState = subState | VISITED_MASK | ReactiveNodeState.Invalid;
      } else {
        let cursor = edge.prevIn;

        while (cursor !== null && cursor !== depsTail) {
          cursor = cursor.prevIn;
        }

        nextState =
          cursor === depsTail
            ? 0
            : subState | VISITED_MASK | ReactiveNodeState.Invalid;
      }
    } else if ((subState & DIRTY_STATE) !== 0) {
      nextState = 0;
    } else {
      nextState = (subState & ~VISITED_MASK) | promoteBit;
    }

    if (nextState !== 0) {
      sub.state = nextState;

      if (__DEV__) {
        recordDebugEvent(context, "propagate", {
          detail: { immediate: promoteBit === IMMEDIATE, nextState },
          source: edge.from,
          target: sub,
        });
      }

      if ((nextState & WATCHER_MASK) === 0) {
        const firstOut = sub.firstOut;

        if (firstOut !== null) {
          if (nextSub !== null) {
            thrown = propagateBranching(
              firstOut,
              nextSub,
              promoteBit,
              thrown,
              context,
              dispatch,
            );

            if (thrown !== null) throw thrown;
            return;
          }

          edge = firstOut;
          promoteBit = NON_IMMEDIATE;
          continue;
        }
      } else {
        if (__DEV__) {
          recordDebugEvent(context, "watcher:invalidated", { node: sub });
        }

        if (dispatch !== undefined) {
          try {
            dispatch(sub);
          } catch (error) {
            if (thrown === null) {
              thrown = error;
            }
          }
        }
      }
    }

    if (nextSub === null) {
      if (thrown !== null) throw thrown;
      return;
    }

    edge = nextSub;
  }
}
