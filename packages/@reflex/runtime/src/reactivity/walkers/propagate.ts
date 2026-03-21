import runtime from "../context";
import {
  type ReactiveEdge,
  MAYBE_CHANGE_STATE,
  CHANGED_STATE,
  DIRTY_STATE,
  WALKER_STATE,
  ReactiveNode,
  ReactiveNodeKind,
  ReactiveNodeState,
} from "../shape";

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
    sub.state = state | MAYBE_CHANGE_STATE;
    return true;
  }

  if ((state & ReactiveNodeState.Tracking) === 0) {
    sub.state = (state & ~ReactiveNodeState.Visited) | MAYBE_CHANGE_STATE;
    return true;
  }

  if (!isTrackedEdge(edge, sub)) {
    return false;
  }

  sub.state = state | ReactiveNodeState.Visited | MAYBE_CHANGE_STATE;
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

    const subKind = sub.kind;
    if (subKind === ReactiveNodeKind.Effect) {
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

  for (let edge = node.firstOut; edge !== null; edge = edge.nextOut) {
    const sub = edge.to;
    const subState = sub.state;

    if ((subState & DIRTY_STATE) !== MAYBE_CHANGE_STATE) {
      continue;
    }

    sub.state = (subState ^ MAYBE_CHANGE_STATE) | CHANGED_STATE;

    if (sub.kind === ReactiveNodeKind.Effect) {
      ctx.notifyEffectInvalidated(sub);
    }
  }
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
  const base = stack.length;
  let edge = startEdge;
  let next: ReactiveEdge | null = startEdge.nextOut;

  try {
    top: do {
      const sub = edge.to;

      if (markSubscriber(edge, sub)) {
        const subKind = sub.kind;

        if (subKind === ReactiveNodeKind.Effect) {
          ctx.notifyEffectInvalidated(sub);
        } else {
          const firstOut = sub.firstOut;

          if (firstOut !== null) {
            if (next !== null) stack.push(next);
            edge = firstOut;
            next = firstOut.nextOut;
            continue;
          }
        }
      }

      if (next !== null) {
        edge = next;
        next = edge.nextOut;
        continue;
      }

      while (stack.length > base) {
        edge = stack.pop()!;
        next = edge.nextOut;
        continue top;
      }

      return;
    } while (true);
  } finally {
    stack.length = base;
  }
}
