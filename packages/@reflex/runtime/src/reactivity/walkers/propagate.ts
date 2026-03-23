import runtime from "../context";
import {
  type ReactiveEdge,
  DIRTY_STATE,
  WALKER_STATE,
  ReactiveNode,
  ReactiveNodeState,
} from "../shape";

// Stores resume edges for sibling continuation. This stack must stay separate
// from dirty-check's parent-link stack because the traversal semantics differ.
let propagateStackTop = -1;

function isTrackedEdge(checkEdge: ReactiveEdge, sub: ReactiveNode): boolean {
  for (let edge = sub.depsTail; edge !== null; edge = edge.prevIn) {
    if (edge === checkEdge) {
      return true;
    }
  }

  return false;
}

function markSubscriber(edge: ReactiveEdge, sub: ReactiveNode): boolean {
  const state = sub.state;

  if (
    (state & DIRTY_STATE) !== 0 ||
    (state & ReactiveNodeState.Disposed) !== 0
  ) {
    return false;
  }

  if ((state & WALKER_STATE) === 0) {
    sub.state = state | ReactiveNodeState.Invalid;
    return true;
  }

  if ((state & ReactiveNodeState.Tracking) === 0) {
    sub.state =
      (state & ~ReactiveNodeState.Visited) | ReactiveNodeState.Invalid;
    return true;
  }

  if (!isTrackedEdge(edge, sub)) {
    return false;
  }

  sub.state = state | ReactiveNodeState.Visited | ReactiveNodeState.Invalid;
  return true;
}

function propagateSingleSubscriber(startEdge: ReactiveEdge): void {
  const ctx = runtime;
  let edge = startEdge;

  while (true) {
    const sub = edge.to;

    if (!markSubscriber(edge, sub)) {
      return;
    }

    if (sub.state & ReactiveNodeState.Recycler) {
      ctx.notifyEffectInvalidated(sub);
      return;
    }

    const firstOut = sub.firstOut;
    if (firstOut === null) {
      return;
    }

    if (firstOut.nextOut !== null) {
      propagate(firstOut);
      return;
    }

    edge = firstOut;
  }
}

export function propagateOnce(node: ReactiveNode): void {
  const ctx = runtime;
  let thrown: unknown = null;

  for (let edge = node.firstOut; edge !== null; edge = edge.nextOut) {
    const sub = edge.to;
    const subState = sub.state;

    if ((subState & DIRTY_STATE) !== ReactiveNodeState.Invalid) {
      continue;
    }

    sub.state =
      (subState & ~ReactiveNodeState.Invalid) | ReactiveNodeState.Changed;

    if (sub.state & ReactiveNodeState.Recycler) {
      try {
        ctx.notifyEffectInvalidated(sub);
      } catch (error) {
        thrown ??= error;
      }
    }
  }

  if (thrown !== null) throw thrown;
}

/**
 * Push-side non-recursive DFS over outgoing subscriber edges.
 * It marks downstream nodes pending and only descends into activated computed
 * subscribers, keeping the traversal iterative for predictable hot-path cost.
 */
export function propagate(startEdge: ReactiveEdge): void {
  if (startEdge.nextOut === null) {
    propagateSingleSubscriber(startEdge);
    return;
  }

  const ctx = runtime;
  const stack = ctx.propagateStack;
  const baseTop = propagateStackTop;
  let edge = startEdge;
  let resumeEdge: ReactiveEdge | null = startEdge.nextOut;
  let thrown: unknown = null;

  try {
    top: do {
      const sub = edge.to;

      if (markSubscriber(edge, sub)) {
        if (sub.state & ReactiveNodeState.Recycler) {
          try {
            ctx.notifyEffectInvalidated(sub);
          } catch (error) {
            thrown ??= error;
          }
        } else {
          const firstOut = sub.firstOut;

          if (firstOut !== null) {
            if (resumeEdge !== null) {
              stack[++propagateStackTop] = resumeEdge;
            }
            edge = firstOut;
            resumeEdge = firstOut.nextOut;
            continue;
          }
        }
      }

      if (resumeEdge !== null) {
        edge = resumeEdge;
        resumeEdge = edge.nextOut;
        continue;
      }

      while (propagateStackTop > baseTop) {
        edge = stack[propagateStackTop--]!;
        resumeEdge = edge.nextOut;
        continue top;
      }

      break;
    } while (true);
  } finally {
    propagateStackTop = baseTop;
    stack.length = baseTop + 1;
  }

  if (thrown !== null) throw thrown;
}
