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
  getNodeContext,
  ReactiveNodeState,
} from "../shape";

const PROMOTABLE_MAYBE_CHANGE_STATE = MAYBE_CHANGE_STATE | CHANGED_STATE;

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
  const ctx = runtime;

  for (let edge = node.firstOut; edge; edge = edge.nextOut) {
    const sub = edge.to;
    const subState = sub.state;

    if ((subState & PROMOTABLE_MAYBE_CHANGE_STATE) !== MAYBE_CHANGE_STATE) {
      continue;
    }

    sub.state = (subState & ~MAYBE_CHANGE_STATE) | CHANGED_STATE;

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
  let sp = 0;
  let edge: ReactiveEdge | null = startEdge;

  while (edge !== null) {
    const next: ReactiveEdge | null = edge.nextOut;
    const sub = edge.to;
    const state = sub.state;

    // fast reject / accept
    if ((state & ACTIVE_PROPAGATION_STATE) === 0) {
      const ns = state | MAYBE_CHANGE_STATE;
      if (ns !== state) sub.state = ns;
    } else if (
      (state & ReactiveNodeState.Disposed) !== 0 ||
      (state & PROPAGATION_REVISIT_STATE) === 0
    ) {
      edge = next !== null ? next : sp ? stack[--sp]! : null;
      continue;
    } else if ((state & DEPENDENCY_TRACKING_STATE) === 0) {
      const ns = (state & ~PROPAGATION_VISITED_STATE) | MAYBE_CHANGE_STATE;
      if (ns !== state) sub.state = ns;
    } else if ((state & DIRTY_STATE) === 0 && isTrackedEdge(edge, sub)) {
      const ns = state | PROPAGATION_VISITED_STATE | MAYBE_CHANGE_STATE;
      if (ns !== state) sub.state = ns;
    } else {
      edge = next !== null ? next : sp ? stack[--sp]! : null;
      continue;
    }

    if (sub.kind === ReactiveNodeKind.Effect) {
      ctx.notifyEffectInvalidated(sub);
      edge = next !== null ? next : sp ? stack[--sp]! : null;
      continue;
    }

    const child = sub.firstOut;
    if (child !== null) {
      if (next !== null) stack[sp++] = next;
      edge = child;
      continue;
    }

    edge = next !== null ? next : sp ? stack[--sp]! : null;
  }
}
