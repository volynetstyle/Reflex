import { recordDebugEvent } from "../../debug";
import { defaultContext } from "../context";
import { devAssertPropagateAlive } from "../dev";
import {
  DIRTY_STATE,
  type ReactiveEdge,
  type ReactiveNode,
  ReactiveNodeState,
} from "../shape";
import {
  DISPOSED_MASK,
  IMMEDIATE,
  NON_IMMEDIATE,
  SLOW_INVALIDATION_MASK,
  TRACKING_MASK,
  VISITED_MASK,
  WATCHER_MASK,
} from "./propagate.constants";

// Resume points stay edge-based: we must come back to a specific sibling link,
// and tracking checks depend on the current incoming edge identity.
const propagateEdgeStack: ReactiveEdge[] = [];

function getInvalidatedSubscriberState(
  edge: ReactiveEdge,
  sub: ReactiveNode,
  subState: number,
  promoteBit: number,
): number {
  const promotedState = (subState & ~VISITED_MASK) | promoteBit;
  const invalidatedState = subState | VISITED_MASK | ReactiveNodeState.Invalid;

  if ((subState & SLOW_INVALIDATION_MASK) === 0) return promotedState;
  if ((subState & DISPOSED_MASK) !== 0) return 0;

  if ((subState & TRACKING_MASK) !== 0) {
    const depsTail = sub.depsTail;
    if (depsTail === null) return 0;
    if (edge === depsTail) return invalidatedState;

    const prevIn = edge.prevIn;
    if (prevIn === null) return invalidatedState;
    if (prevIn === depsTail) return 0;

    let cursor = prevIn.prevIn;
    while (cursor !== null && cursor !== depsTail) {
      cursor = cursor.prevIn;
    }

    return cursor === depsTail ? 0 : invalidatedState;
  }

  return (subState & DIRTY_STATE) !== 0 ? 0 : promotedState;
}

export function propagate(
  startEdge: ReactiveEdge,
  promoteImmediate: number = NON_IMMEDIATE,
): void {
  const root = startEdge.from;

  if ((root.state & ReactiveNodeState.Disposed) !== 0) {
    if (__DEV__) devAssertPropagateAlive();
    return;
  }

  const context = defaultContext;
  const dispatch = context.effectInvalidatedDispatch;
  const edgeStack = propagateEdgeStack;
  const stackBase = edgeStack.length;
  let stackTop = stackBase;
  let edge = startEdge;

  let thrown: unknown = null;

  while (true) {
    const sub = edge.to;
    const next = edge.nextOut;
    const promoteBit = edge.from === root ? promoteImmediate : NON_IMMEDIATE;
    const nextState = getInvalidatedSubscriberState(
      edge,
      sub,
      sub.state,
      promoteBit,
    );

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
          if (next !== null) edgeStack[stackTop++] = next;
          edge = firstOut;
          continue;
        }
      } else if (dispatch !== undefined) {
        try {
          dispatch(sub);
        } catch (error) {
          if (thrown === null) {
            thrown = error;
          }
        }
      } else if (__DEV__) {
        recordDebugEvent(context, "watcher:invalidated", { node: sub });
      }
    }

    if (next !== null) {
      edge = next;
      continue;
    }

    if (stackTop !== stackBase) {
      edge = edgeStack[--stackTop]!;
      continue;
    }

    break;
  }

  edgeStack.length = stackBase;

  if (thrown !== null) throw thrown;
}
