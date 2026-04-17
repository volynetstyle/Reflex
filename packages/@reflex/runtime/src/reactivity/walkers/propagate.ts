import { recordDebugEvent } from "../../debug.runtime";
import { defaultContext, dispatchEffectInvalidated } from "../context";
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
const propagatePromoteStack: number[] = [];
let propagateStackTop = 0;

function dispatchInvalidatedWatcher(
  sub: ReactiveNode,
  dispatch: typeof dispatchEffectInvalidated,
  thrown: unknown,
): unknown {
  if (dispatch !== undefined) {
    try {
      dispatch(sub);
    } catch (error) {
      if (thrown === null) {
        return error;
      }
    }
  } else if (__DEV__) {
    recordDebugEvent(defaultContext, "watcher:invalidated", { node: sub });
  }

  return thrown;
}

function getTrackingInvalidatedSubscriberState(
  edge: ReactiveEdge,
  sub: ReactiveNode,
  subState: number,
): number {
  const depsTail = sub.depsTail;
  if (depsTail === null) return 0;

  const invalidatedState = subState | VISITED_MASK | ReactiveNodeState.Invalid;
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

function getSlowInvalidatedSubscriberState(
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

function propagateBranching(
  edge: ReactiveEdge,
  promote: number,
  thrown: unknown,
  parentResume: ReactiveEdge | null,
  parentResumePromote: number,
): unknown {
  const edgeStack = propagateEdgeStack;
  const promoteStack = propagatePromoteStack;
  const stackBase = propagateStackTop;
  let stackTop = stackBase;
  let stackHigh = stackTop;
  let next: ReactiveEdge | null = edge.nextOut;
  let nextPromote = promote;
  const dispatch = dispatchEffectInvalidated;

  if (parentResume !== null) {
    edgeStack[stackTop] = parentResume;
    promoteStack[stackTop++] = parentResumePromote;
    if (stackTop > stackHigh) stackHigh = stackTop;
  }

  while (true) {
    const sub = edge.to;
    const subState = sub.state;
    let nextState: number;

    if ((subState & SLOW_INVALIDATION_MASK) === 0) {
      nextState = (subState & ~VISITED_MASK) | promote;
    } else if ((subState & TRACKING_MASK) !== 0) {
      nextState = getTrackingInvalidatedSubscriberState(edge, sub, subState);
    } else {
      nextState =
        (subState & (DIRTY_STATE | DISPOSED_MASK)) !== 0
          ? 0
          : (subState & ~VISITED_MASK) | promote;
    }

    if (nextState !== 0) {
      sub.state = nextState;

      if (__DEV__) {
        recordDebugEvent(defaultContext, "propagate", {
          detail: { immediate: promote === IMMEDIATE, nextState },
          source: edge.from,
          target: sub,
        });
      }

      if ((nextState & WATCHER_MASK) === 0) {
        const firstOut = sub.firstOut;
        if (firstOut !== null) {
          if (next !== null) {
            edgeStack[stackTop] = next;
            promoteStack[stackTop++] = nextPromote;
            if (stackTop > stackHigh) stackHigh = stackTop;
          }

          edge = firstOut;
          next = edge.nextOut;
          promote = nextPromote = NON_IMMEDIATE;
          continue;
        }
      } else {
        propagateStackTop = stackTop;
        thrown = dispatchInvalidatedWatcher(sub, dispatch, thrown);
      }
    }

    if (next !== null) {
      edge = next;
      promote = nextPromote;
      next = edge.nextOut;
      continue;
    }

    if (stackTop !== stackBase) {
      edge = edgeStack[--stackTop]!;
      promote = nextPromote = promoteStack[stackTop]!;
      next = edge.nextOut;
      continue;
    }

    while (stackHigh > stackBase) {
      const slot = --stackHigh;
      edgeStack[slot] = undefined!;
      promoteStack[slot] = undefined!;
    }
    propagateStackTop = stackBase;
    return thrown;
  }
}

function propagateLinear(
  edge: ReactiveEdge,
  promote: number,
): unknown {
  let thrown: unknown = null;
  const dispatch = dispatchEffectInvalidated;

  while (true) {
    const sub = edge.to;
    const next = edge.nextOut;
    const subState = sub.state;
    const nextState =
      (subState & SLOW_INVALIDATION_MASK) === 0
        ? (subState & ~VISITED_MASK) | promote
        : getSlowInvalidatedSubscriberState(edge, sub, subState, promote);

    if (nextState !== 0) {
      sub.state = nextState;

      if (__DEV__) {
        recordDebugEvent(defaultContext, "propagate", {
          detail: { immediate: promote === IMMEDIATE, nextState },
          source: edge.from,
          target: sub,
        });
      }

      if ((nextState & WATCHER_MASK) === 0) {
        const firstOut = sub.firstOut;
        if (firstOut !== null) {
          edge = firstOut;

          if (next !== null) {
            return propagateBranching(
              edge,
              NON_IMMEDIATE,
              thrown,
              next,
              promote,
            );
          }

          promote = NON_IMMEDIATE;
          continue;
        }
      } else {
        thrown = dispatchInvalidatedWatcher(sub, dispatch, thrown);
      }
    }

    if (next === null) return thrown;
    edge = next;
  }
}

export function propagate(
  startEdge: ReactiveEdge,
  promoteImmediate: number = NON_IMMEDIATE,
) {
  const root = startEdge.from;

  if ((root.state & ReactiveNodeState.Disposed) !== 0) {
    if (__DEV__) devAssertPropagateAlive();
    return;
  }

  const thrown = propagateLinear(startEdge, promoteImmediate);

  return thrown;
}
