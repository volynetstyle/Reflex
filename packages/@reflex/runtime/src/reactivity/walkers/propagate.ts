import type { ExecutionContext } from "../context";
import type { ReactiveNode } from "../shape";
import { recordDebugEvent } from "../../debug";
import {
  type ReactiveEdge,
  DIRTY_STATE,
  WALKER_STATE,
  ReactiveNodeState,
} from "../shape";

export const NON_IMMEDIATE = 0;
export const IMMEDIATE = 1;

const INVALIDATION_SLOW_PATH_MASK =
  DIRTY_STATE | ReactiveNodeState.Disposed | WALKER_STATE;

function isTrackedPrefixEdge(
  edge: ReactiveEdge,
  depsTail: ReactiveEdge | null,
): boolean {
  if (depsTail === null) return false;
  if (edge === depsTail) return true;

  for (let cursor = edge.prevIn; cursor !== null; cursor = cursor.prevIn) {
    if (cursor === depsTail) return false;
  }

  return true;
}

function notifyWatcherInvalidation(
  node: ReactiveNode,
  thrown: unknown,
  context: ExecutionContext,
): unknown {
  try {
    context.dispatchWatcherEvent(node);
  } catch (error) {
    return thrown ?? error;
  }

  return thrown;
}

function recordPropagation(
  edge: ReactiveEdge,
  nextState: number,
  promote: number,
  context: ExecutionContext,
): void {
  if (!__DEV__) return;

  recordDebugEvent(context, "propagate", {
    detail: {
      immediate: promote !== 0,
      nextState,
    },
    source: edge.from,
    target: edge.to,
  });
}

function promoteInvalidSubscriber(node: ReactiveNode): boolean {
  const state = node.state;

  if ((state & DIRTY_STATE) !== ReactiveNodeState.Invalid) return false;

  node.state = (state & ~ReactiveNodeState.Invalid) | ReactiveNodeState.Changed;
  return true;
}

function getSlowInvalidatedSubscriberState(
  edge: ReactiveEdge,
  state: number,
  promoteImmediate: number,
): number {
  const sub = edge.to;

  if ((state & (DIRTY_STATE | ReactiveNodeState.Disposed)) !== 0) return 0;

  if ((state & ReactiveNodeState.Tracking) === 0) {
    const cleared = state & ~ReactiveNodeState.Visited;
    return (
      cleared |
      (promoteImmediate ? ReactiveNodeState.Changed : ReactiveNodeState.Invalid)
    );
  }

  return isTrackedPrefixEdge(edge, sub.depsTail)
    ? state | ReactiveNodeState.Visited | ReactiveNodeState.Invalid
    : 0;
}

export function propagateOnce(
  node: ReactiveNode,
  context: ExecutionContext,
): void {
  let thrown: unknown = null;

  for (let edge = node.firstOut; edge !== null; edge = edge.nextOut) {
    const sub = edge.to;
    if (!promoteInvalidSubscriber(sub)) continue;

    recordPropagation(edge, sub.state, IMMEDIATE, context);

    if ((sub.state & ReactiveNodeState.Watcher) !== 0) {
      thrown = notifyWatcherInvalidation(sub, thrown, context);
    }
  }

  if (thrown !== null) throw thrown;
}

function propagateBranching(
  edge: ReactiveEdge,
  promote: number,
  resume: ReactiveEdge | null,
  resumePromote: number,
  thrown: unknown,
  context: ExecutionContext,
): unknown {
  const edgeStack: ReactiveEdge[] = [];
  const promoteStack: number[] = [];
  let stackTop = -1;

  // The fast invalidation branch stays duplicated here and in propagateLinear.
  // That keeps the hot loop flatter and benchmarks better than routing through
  // a shared helper before entering the slow path.
  while (true) {
    const sub = edge.to;
    const state = sub.state;
    const nextState =
      (state & INVALIDATION_SLOW_PATH_MASK) === 0
        ? state |
          (promote ? ReactiveNodeState.Changed : ReactiveNodeState.Invalid)
        : getSlowInvalidatedSubscriberState(edge, state, promote);

    if (nextState !== 0) {
      sub.state = nextState;
      recordPropagation(edge, nextState, promote, context);

      if ((nextState & ReactiveNodeState.Watcher) !== 0) {
        thrown = notifyWatcherInvalidation(sub, thrown, context);
      } else {
        const firstOut = sub.firstOut;
        if (firstOut !== null) {
          if (resume !== null) {
            stackTop += 1;
            edgeStack[stackTop] = resume;
            promoteStack[stackTop] = resumePromote;
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
    } else if (stackTop >= 0) {
      edge = edgeStack[stackTop]!;
      promote = resumePromote = promoteStack[stackTop]!;
      --stackTop;
      resume = edge.nextOut;
    } else {
      return thrown;
    }
  }
}

function propagateLinear(
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

    if (nextState !== 0) {
      sub.state = nextState;
      recordPropagation(edge, nextState, promote, context);

      if ((nextState & ReactiveNodeState.Watcher) !== 0) {
        thrown = notifyWatcherInvalidation(sub, thrown, context);
      } else {
        const firstOut = sub.firstOut;
        if (firstOut !== null) {
          edge = firstOut;

          if (next !== null) {
            return propagateBranching(
              edge,
              NON_IMMEDIATE,
              next,
              promote,
              thrown,
              context,
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
  promoteImmediate = 0,
  context: ExecutionContext,
): void {
  const thrown = propagateLinear(startEdge, promoteImmediate, null, context);

  if (thrown !== null) throw thrown;
}
