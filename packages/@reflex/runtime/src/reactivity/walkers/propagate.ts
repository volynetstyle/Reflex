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
const propagatePromoteStack: Uint32Array = new Uint32Array(512);

function getInvalidatedSubscriberState(
  edge: ReactiveEdge,
  sub: ReactiveNode,
  subState: number,
  promoteBit: number,
): number {
  if ((subState & SLOW_INVALIDATION_MASK) === 0) {
    return (subState & ~VISITED_MASK) | promoteBit;
  }

  if ((subState & DISPOSED_MASK) !== 0) {
    return 0;
  }

  if ((subState & TRACKING_MASK) !== 0) {
    const depsTail = sub.depsTail;

    if (depsTail === null) {
      return 0;
    }

    if (edge === depsTail) {
      return subState | VISITED_MASK | ReactiveNodeState.Invalid;
    }

    const prevIn = edge.prevIn;

    if (prevIn === null) {
      return subState | VISITED_MASK | ReactiveNodeState.Invalid;
    }

    if (prevIn === depsTail) {
      return 0;
    }

    let cursor = prevIn.prevIn;

    while (cursor !== null && cursor !== depsTail) {
      cursor = cursor.prevIn;
    }

    return cursor === depsTail
      ? 0
      : subState | VISITED_MASK | ReactiveNodeState.Invalid;
  }

  if ((subState & DIRTY_STATE) !== 0) {
    return 0;
  }

  return (subState & ~VISITED_MASK) | promoteBit;
}

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
  const edgeStack = propagateEdgeStack;
  const promoteStack = propagatePromoteStack;
  const stackBase = edgeStack.length;
  let stackTop = stackBase;
  let edge = startEdge;
  let promoteBit = promoteImmediate;
  let thrown: unknown = null;

  try {
    while (true) {
      while (true) {
        const sub = edge.to;
        const next = edge.nextOut;
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
              if (next !== null) {
                edgeStack[stackTop] = next;
                promoteStack[stackTop++] = promoteBit;
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

        if (next === null) {
          break;
        }

        edge = next;
      }

      if (stackTop === stackBase) {
        break;
      }

      edge = edgeStack[--stackTop]!;
      promoteBit = promoteStack[stackTop]!;
    }
  } finally {
    edgeStack.length = stackBase;
  }

  if (thrown !== null) throw thrown;
}
