import {
  ACTIVE_PROPAGATION_STATE,
  CHANGED_STATE,
  DEPENDENCY_TRACKING_STATE,
  DIRTY_STATE,
  PENDING_STATE,
  PROPAGATION_REVISIT_STATE,
  PROPAGATION_VISITED_STATE,
  type ReactiveEdge,
  ReactiveNode,
  ReactiveNodeKind,
  getNodeContext,
  ReactiveNodeState,
} from "../shape";

const PROMOTABLE_PENDING_STATE = PENDING_STATE | CHANGED_STATE;

/**
 * Walk the reused dependency prefix backwards from depsTail to confirm that the
 * currently visited outgoing edge still belongs to the consumer's active graph.
 */
function isTrackedEdge(checkEdge: ReactiveEdge, sub: ReactiveNode): boolean {
  let edge = sub.depsTail;

  while (edge) {
    if (edge === checkEdge) {
      return true;
    }

    edge = edge.prevIn;
  }

  return false;
}

export function shallowPropagate(node: ReactiveNode): void {
  const ctx = getNodeContext(node);

  for (let edge = node.firstOut; edge; edge = edge.nextOut) {
    const sub = edge.to;
    const subState = sub.state;

    if ((subState & PROMOTABLE_PENDING_STATE) !== PENDING_STATE) {
      continue;
    }

    sub.state = (subState & ~PENDING_STATE) | CHANGED_STATE;

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
  const ctx = getNodeContext(startEdge.to);
  const stack = ctx.edgeStack;
  let stackSize = 0;
  let edge: ReactiveEdge | null = startEdge;
  let next: ReactiveEdge | null = startEdge.nextOut;
  stack.length = 0;

  while (edge) {
    const sub: ReactiveNode = edge.to;
    const subState = sub.state;

    if ((subState & ACTIVE_PROPAGATION_STATE) === 0) {
      sub.state = subState | PENDING_STATE;
    } else {
      if (
        (subState & ReactiveNodeState.Disposed) !== 0 ||
        (subState & PROPAGATION_REVISIT_STATE) === 0
      ) {
        if ((edge = next) !== null) {
          next = edge.nextOut;
          continue;
        }

        while (stackSize) {
          edge = stack[--stackSize]!;
          stack[stackSize] = null;
          next = edge.nextOut;
          break;
        }

        if (edge === null) {
          break;
        }

        continue;
      }

      if ((subState & DEPENDENCY_TRACKING_STATE) === 0) {
        sub.state = (subState & ~PROPAGATION_VISITED_STATE) | PENDING_STATE;
      } else if ((subState & DIRTY_STATE) === 0 && isTrackedEdge(edge, sub)) {
        sub.state = subState | PROPAGATION_VISITED_STATE | PENDING_STATE;
      } else {
        if ((edge = next) !== null) {
          next = edge.nextOut;
          continue;
        }

        while (stackSize) {
          edge = stack[--stackSize]!;
          stack[stackSize] = null;
          next = edge.nextOut;
          break;
        }

        if (edge === null) {
          break;
        }

        continue;
      }
    }

    if (sub.kind === ReactiveNodeKind.Effect) {
      ctx.notifyEffectInvalidated(sub);
    } else {
      const firstSubscriberEdge: ReactiveEdge | null = sub.firstOut;
      if (firstSubscriberEdge) {
        if (next !== null) {
          stack[stackSize++] = next;
        }
        edge = firstSubscriberEdge;
        next = firstSubscriberEdge.nextOut;
        continue;
      }
    }

    if ((edge = next) !== null) {
      next = edge.nextOut;
      continue;
    }

    while (stackSize) {
      edge = stack[--stackSize]!;
      stack[stackSize] = null;

      if (edge) {
        next = edge.nextOut;
        break;
      }
    }

    if (stackSize === 0 && edge === null) {
      break;
    }
  }

  stack.length = 0;
}
