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
  isDisposedState,
} from "../shape";

const enum PropagationFlagTransition {
  Skip = 0,
  MarkPending = 1,
  ResetPending = 2,
  MarkTrackedPending = 3,
}

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

/**
 * One-hop subscriber sweep used after recompute has already proven that a node
 * changed. It upgrades direct pending subscribers to changed without descending.
 */
function promotePendingSubscriber(sub: ReactiveNode): boolean {
  const subState = sub.state;

  if ((subState & PROMOTABLE_PENDING_STATE) !== PENDING_STATE) {
    return false;
  }

  sub.state = (subState & ~PENDING_STATE) | CHANGED_STATE;
  return true;
}

/**
 * Flag state machine for the push phase.
 * It decides whether a subscriber should become pending, be revisited through
 * the tracked-dependency cursor, or be skipped entirely.
 */
function resolvePropagationTransition(
  subState: number,
  edge: ReactiveEdge,
  sub: ReactiveNode,
): PropagationFlagTransition {
  if (isDisposedState(subState)) {
    return PropagationFlagTransition.Skip;
  }

  if ((subState & ACTIVE_PROPAGATION_STATE) === 0) {
    return PropagationFlagTransition.MarkPending;
  }

  if ((subState & PROPAGATION_REVISIT_STATE) === 0) {
    return PropagationFlagTransition.Skip;
  }

  if ((subState & DEPENDENCY_TRACKING_STATE) === 0) {
    return PropagationFlagTransition.ResetPending;
  }

  if ((subState & DIRTY_STATE) !== 0 || !isTrackedEdge(edge, sub)) {
    return PropagationFlagTransition.Skip;
  }

  return PropagationFlagTransition.MarkTrackedPending;
}

export function shallowPropagate(node: ReactiveNode): void {
  const ctx = getNodeContext(node);

  for (let edge = node.firstOut; edge; edge = edge.nextOut) {
    const sub = edge.to;

    if (!promotePendingSubscriber(sub)) {
      continue;
    }

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
    const transition = resolvePropagationTransition(subState, edge, sub);

    if (transition !== PropagationFlagTransition.Skip) {
      if (transition === PropagationFlagTransition.MarkPending) {
        sub.state = subState | PENDING_STATE;
      } else if (transition === PropagationFlagTransition.ResetPending) {
        sub.state = (subState & ~PROPAGATION_VISITED_STATE) | PENDING_STATE;
      } else {
        sub.state = subState | PROPAGATION_VISITED_STATE | PENDING_STATE;
      }

      if (sub.kind === ReactiveNodeKind.Effect) {
        ctx.notifyEffectInvalidated(sub);
      } else {
        const firstSubscriberEdge: ReactiveEdge | null = sub.firstOut;
        if (firstSubscriberEdge) {
          edge = firstSubscriberEdge;
          if (firstSubscriberEdge.nextOut) {
            stack[stackSize++] = next;
            next = firstSubscriberEdge.nextOut;
          } else {
            next = null;
          }
          continue;
        }
      }
    }

    if ((edge = next) !== null) {
      next = edge.nextOut;
      continue;
    }

    while (stackSize) {
      edge = stack[--stackSize] ?? null;
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
