import runtime from "../context";
import type { ReactiveNode } from "../shape";
import {
  type ReactiveEdge,
  DIRTY_STATE,
  WALKER_STATE,
  ReactiveNodeState,
} from "../shape";

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
): unknown {
  try {
    runtime.dispatchWatcherEvent(node);
  } catch (error) {
    return thrown ?? error;
  }

  return thrown;
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
  promoteImmediate: boolean,
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

export function propagateOnce(node: ReactiveNode): void {
  let thrown: unknown = null;

  for (let edge = node.firstOut; edge !== null; edge = edge.nextOut) {
    const sub = edge.to;
    if (!promoteInvalidSubscriber(sub)) continue;

    if ((sub.state & ReactiveNodeState.Watcher) !== 0) {
      thrown = notifyWatcherInvalidation(sub, thrown);
    }
  }

  if (thrown !== null) throw thrown;
}

function propagateBranching(
  edge: ReactiveEdge,
  promote: boolean,
  resume: ReactiveEdge | null,
  resumePromote: boolean,
  thrown: unknown,
): unknown {
  const edgeStack: ReactiveEdge[] = [];
  const promoteStack: boolean[] = [];
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

      if ((nextState & ReactiveNodeState.Watcher) !== 0) {
        thrown = notifyWatcherInvalidation(sub, thrown);
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
          promote = resumePromote = false;
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
      stackTop -= 1;
      resume = edge.nextOut;
    } else {
      return thrown;
    }
  }
}

function propagateLinear(
  edge: ReactiveEdge,
  promote: boolean,
  thrown: unknown,
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

      if ((nextState & ReactiveNodeState.Watcher) !== 0) {
        thrown = notifyWatcherInvalidation(sub, thrown);
      } else {
        const firstOut = sub.firstOut;
        if (firstOut !== null) {
          edge = firstOut;

          if (next !== null) {
            return propagateBranching(edge, false, next, promote, thrown);
          }

          promote = false;
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
  promoteImmediate = false,
): void {
  const thrown = propagateLinear(startEdge, promoteImmediate, null);

  if (thrown !== null) throw thrown;
}
