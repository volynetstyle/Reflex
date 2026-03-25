import runtime from "../context";
import {
  type ReactiveEdge,
  DIRTY_STATE,
  WALKER_STATE,
  ReactiveNode,
  ReactiveNodeState,
} from "../shape";

function isTrackedPrefixEdge(
  edge: ReactiveEdge,
  depsTail: ReactiveEdge | null,
): boolean {
  if (depsTail === null) return false;
  if (edge === depsTail) return true;

  // depsTail splits the incoming list into the tracked prefix and the stale
  // suffix. If walking backwards from edge reaches depsTail, the edge is in
  // the stale suffix and must not be invalidated while the consumer is still
  // collecting its next dependency prefix.
  for (let cursor = edge.prevIn; cursor !== null; cursor = cursor.prevIn) {
    if (cursor === depsTail) return false;
  }

  // Otherwise edge sits somewhere before depsTail, or is the current head.
  return edge.prevIn !== null || edge.to.firstIn === edge;
}

function dispatchWatcherInvalidation(
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

function promoteChangedSubscriber(node: ReactiveNode): boolean {
  const state = node.state;

  if ((state & DIRTY_STATE) !== ReactiveNodeState.Invalid) {
    return false;
  }

  node.state = (state & ~ReactiveNodeState.Invalid) | ReactiveNodeState.Changed;
  return true;
}

function getInvalidatedSubscriberState(
  edge: ReactiveEdge,
  promoteImmediate: boolean,
): number {
  const sub = edge.to;
  const state = sub.state;

  if (
    (state & DIRTY_STATE) !== 0 ||
    (state & ReactiveNodeState.Disposed) !== 0
  ) {
    return 0;
  }

  if (promoteImmediate && (state & ReactiveNodeState.Tracking) === 0) {
    if ((state & WALKER_STATE) === 0) {
      return state | ReactiveNodeState.Changed;
    }

    return (state & ~ReactiveNodeState.Visited) | ReactiveNodeState.Changed;
  }

  if ((state & WALKER_STATE) === 0) {
    // Fast path: a clean idle node can be marked invalid immediately.
    return state | ReactiveNodeState.Invalid;
  }

  if ((state & ReactiveNodeState.Tracking) === 0) {
    // The node is already in a walker-related state, but not actively
    // tracking right now, so we only need to clear stale Visited markers.
    return (state & ~ReactiveNodeState.Visited) | ReactiveNodeState.Invalid;
  }

  if (!isTrackedPrefixEdge(edge, sub.depsTail)) {
    return 0;
  }

  // While a consumer is tracking, only edges inside the confirmed prefix
  // are allowed to invalidate it. Marking Visited records that we hit an
  // active dependency during this push walk.
  return state | ReactiveNodeState.Visited | ReactiveNodeState.Invalid;
}

export function propagateOnce(node: ReactiveNode): void {
  let thrown: unknown = null;

  for (let edge = node.firstOut; edge !== null; edge = edge.nextOut) {
    const sub = edge.to;
    if (!promoteChangedSubscriber(sub)) {
      continue;
    }

    if ((sub.state & ReactiveNodeState.Watcher) !== 0) {
      thrown = dispatchWatcherInvalidation(sub, thrown);
    }
  }

  if (thrown !== null) throw thrown;
}

/**
 * Push-side non-recursive DFS over outgoing subscriber edges.
 * It starts in the cheapest mode possible:
 * mark one subscriber, keep walking a single chain if there is only one edge,
 * and escalate to sibling-resume DFS only when branching actually appears.
 */
export function propagate(startEdge: ReactiveEdge, promoteImmediate = false): void {
  const stack: Array<{ edge: ReactiveEdge; promoteImmediate: boolean }> = [];

  // Stores resume edges for sibling continuation. This stack must stay separate
  // from dirty-check's parent-link stack because the traversal semantics differ.
  let propagateStackTop = -1;

  let edge = startEdge;
  let resumeEdge: ReactiveEdge | null = startEdge.nextOut;
  let currentPromoteImmediate = promoteImmediate;
  let resumePromoteImmediate = promoteImmediate;
  let thrown: unknown = null;

  while (true) {
    const sub = edge.to;
    // 0 means "do not touch this subscriber". Any non-zero value is the exact
    // state we want to commit once the current edge passes all guards.
    const nextSubState = getInvalidatedSubscriberState(
      edge,
      currentPromoteImmediate,
    );

    if (nextSubState !== 0) {
      sub.state = nextSubState;

      if ((nextSubState & ReactiveNodeState.Watcher) !== 0) {
        // Watchers are leaves for this traversal: notify them, but do not walk
        // past them because they do not propagate further through firstOut.
        thrown = dispatchWatcherInvalidation(sub, thrown);
      } else {
        const firstOut = sub.firstOut;

        if (firstOut !== null) {
          // We are about to dive into the first child. Save the current sibling
          // chain so the DFS can resume it after the child subtree completes.
          if (resumeEdge !== null) {
            stack[++propagateStackTop] = {
              edge: resumeEdge,
              promoteImmediate: resumePromoteImmediate,
            };
          }

          edge = firstOut;
          resumeEdge = firstOut.nextOut;
          currentPromoteImmediate = false;
          resumePromoteImmediate = false;
          continue;
        }
      }
    }

    // Prefer the next sibling in the current chain. If there is none, pop the
    // most recent deferred sibling chain from the explicit DFS stack.
    const nextFrame =
      resumeEdge !== null
        ? {
            edge: resumeEdge,
            promoteImmediate: resumePromoteImmediate,
          }
        : propagateStackTop >= 0
          ? stack[propagateStackTop--]!
          : null;

    if (nextFrame === null) break;
    edge = nextFrame.edge;
    currentPromoteImmediate = nextFrame.promoteImmediate;
    resumeEdge = nextFrame.edge.nextOut;
    resumePromoteImmediate = nextFrame.promoteImmediate;
  }

  if (thrown !== null) throw thrown;
}
