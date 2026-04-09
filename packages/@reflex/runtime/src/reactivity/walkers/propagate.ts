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
const propagatePromoteStack: number[] = [];

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
  dispatch: ((node: ReactiveNode) => void) | undefined,
  context: typeof defaultContext,
  thrown: unknown,
  parentResume: ReactiveEdge | null,
  parentResumePromote: number,
): unknown {
  const edgeStack = propagateEdgeStack;
  const promoteStack = propagatePromoteStack;
  const stackBase = edgeStack.length;
  let stackTop = stackBase;
  let resume: ReactiveEdge | null = edge.nextOut;
  let resumePromote = promote;

  if (parentResume !== null) {
    edgeStack[stackTop] = parentResume;
    promoteStack[stackTop++] = parentResumePromote;
  }

  while (true) {
    const sub = edge.to;
    const subState = sub.state;
    const nextState =
      (subState & SLOW_INVALIDATION_MASK) === 0
        ? (subState & ~VISITED_MASK) | promote
        : getSlowInvalidatedSubscriberState(edge, sub, subState, promote);

    if (nextState !== 0) {
      sub.state = nextState;

      if (__DEV__) {
        recordDebugEvent(context, "propagate", {
          detail: { immediate: promote === IMMEDIATE, nextState },
          source: edge.from,
          target: sub,
        });
      }

      if ((nextState & WATCHER_MASK) !== 0) {
        if (dispatch !== undefined) {
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
      } else {
        const firstOut = sub.firstOut;
        if (firstOut !== null) {
          if (resume !== null) {
            edgeStack[stackTop] = resume;
            promoteStack[stackTop++] = resumePromote;
          }

          edge = firstOut;
          resume = edge.nextOut;
          promote = resumePromote = NON_IMMEDIATE;
          continue;
        }
      }
    }

    if (resume !== null) {
      edge = resume;
      promote = resumePromote;
      resume = edge.nextOut;
      continue;
    }

    if (stackTop !== stackBase) {
      edge = edgeStack[--stackTop]!;
      promote = resumePromote = promoteStack[stackTop]!;
      resume = edge.nextOut;
      continue;
    }

    edgeStack.length = stackBase;
    promoteStack.length = stackBase;
    return thrown;
  }
}

function propagateLinear(
  edge: ReactiveEdge,
  promote: number,
  dispatch: ((node: ReactiveNode) => void) | undefined,
  context: typeof defaultContext,
): unknown {
  let thrown: unknown = null;

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
        recordDebugEvent(context, "propagate", {
          detail: { immediate: promote === IMMEDIATE, nextState },
          source: edge.from,
          target: sub,
        });
      }

      if ((nextState & WATCHER_MASK) !== 0) {
        if (dispatch !== undefined) {
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
      } else {
        const firstOut = sub.firstOut;
        if (firstOut !== null) {
          edge = firstOut;

          if (next !== null) {
            return propagateBranching(
              edge,
              NON_IMMEDIATE,
              dispatch,
              context,
              thrown,
              next,
              promote,
            );
          }

          promote = NON_IMMEDIATE;
          continue;
        }
      }
    }

    if (next === null) return thrown;
    edge = next;
  }
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
  const dispatch = context.dispatchWatcherEvent;
  const thrown = propagateLinear(startEdge, promoteImmediate, dispatch, context);

  if (thrown !== null) throw thrown;
}
