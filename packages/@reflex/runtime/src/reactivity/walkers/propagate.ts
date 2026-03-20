import runtime from "../../runtime";
import {
  ACTIVE_PROPAGATION_STATE,
  CHANGED_STATE,
  DEPENDENCY_TRACKING_STATE,
  DIRTY_STATE,
  MAYBE_CHANGE_STATE,
  PROPAGATION_REVISIT_STATE,
  PROPAGATION_VISITED_STATE,
  type ReactiveEdge,
  ReactiveNode,
  ReactiveNodeKind,
  ReactiveNodeState,
} from "../shape";

const PROMOTABLE_MAYBE_CHANGE_STATE = MAYBE_CHANGE_STATE | CHANGED_STATE;

/**
 * Walk the reused dependency prefix backwards from depsTail to confirm that the
 * currently visited outgoing edge still belongs to the consumer's active graph.
 */
function isTrackedEdge(checkEdge: ReactiveEdge, sub: ReactiveNode): boolean {
  const tail = sub.depsTail;
  for (let edge = sub.firstIn; edge !== null; edge = edge.nextIn) {
    if (edge === checkEdge) {
      return true;
    }

    if (edge === tail) {
      break;
    }
  }

  return false;
}

export function shallowPropagate(node: ReactiveNode): void {
  const ctx = runtime;

  for (let edge = node.firstOut; edge !== null; edge = edge.nextOut) {
    const sub = edge.to;
    const subState = sub.state;

    if ((subState & PROMOTABLE_MAYBE_CHANGE_STATE) !== MAYBE_CHANGE_STATE) {
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
  const ctx = runtime;
  const stack = ctx.edgeStack;
  const base = stack.length;
  let sp = base;
  let edge: ReactiveEdge | null = startEdge;
  let next: ReactiveEdge | null = startEdge.nextOut;

  top: do {
    const current: ReactiveEdge = edge!;
    const sub: ReactiveNode = current.to;
    const state = sub.state;

    if ((state & ACTIVE_PROPAGATION_STATE) === 0) {
      sub.state = state | MAYBE_CHANGE_STATE;
    } else if (
      (state & ReactiveNodeState.Disposed) !== 0 ||
      (state & PROPAGATION_REVISIT_STATE) === 0
    ) {
      if ((edge = next) !== null) {
        next = edge.nextOut;
        continue;
      }

      while (sp > base) {
        edge = stack[--sp]!;
        next = edge.nextOut;
        continue top;
      }

      break;
    } else if ((state & DEPENDENCY_TRACKING_STATE) === 0) {
      sub.state = (state & ~PROPAGATION_VISITED_STATE) | MAYBE_CHANGE_STATE;
    } else if ((state & DIRTY_STATE) === 0 && isTrackedEdge(current, sub)) {
      sub.state = state | PROPAGATION_VISITED_STATE | MAYBE_CHANGE_STATE;
    } else {
      if ((edge = next) !== null) {
        next = edge.nextOut;
        continue;
      }

      while (sp > base) {
        edge = stack[--sp]!;
        next = edge.nextOut;
        continue top;
      }

      break;
    }

    if (sub.kind === ReactiveNodeKind.Effect) {
      ctx.notifyEffectInvalidated(sub);
    } else {
      const child: ReactiveEdge | null = sub.firstOut;
      if (child !== null) {
        if (next !== null) {
          stack[sp++] = next;
        }
        edge = child;
        next = child.nextOut;
        continue;
      }
    }

    if ((edge = next) !== null) {
      next = edge.nextOut;
      continue;
    }

    while (sp > base) {
      edge = stack[--sp]!;
      next = edge.nextOut;
      continue top;
    }

    break;
  } while (true);

  stack.length = base;
}
