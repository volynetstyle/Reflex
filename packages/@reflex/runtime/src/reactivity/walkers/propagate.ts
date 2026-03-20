import runtime from "../context";
import {
  CHANGED_STATE,
  DIRTY_STATE,
  MAYBE_CHANGE_STATE,
  type ReactiveEdge,
  ReactiveNode,
  ReactiveNodeKind,
  ReactiveNodeState,
} from "../shape";

/**
 * Walk the active dependency prefix backwards from depsTail to confirm that the
 * currently visited outgoing edge still belongs to the consumer's graph.
 */
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
  const dirty = (state & DIRTY_STATE) !== 0;
  const visited = (state & ReactiveNodeState.Visited) !== 0;
  const tracking = (state & ReactiveNodeState.Tracking) !== 0;

  if (!dirty && !visited && !tracking) {
    sub.state = state | MAYBE_CHANGE_STATE;
    return true;
  }

  if (dirty || (state & ReactiveNodeState.Disposed) !== 0) {
    return false;
  }

  if (!visited && !tracking) {
    return false;
  }

  // Mirror the alien runtime cases explicitly:
  // - visited without tracking => clear the traversal mark and keep maybe-change
  // - tracking => revisit only if the outgoing edge is still in the active deps prefix
  if (!tracking) {
    sub.state = (state & ~ReactiveNodeState.Visited) | MAYBE_CHANGE_STATE;
    return true;
  }

  if (!isTrackedEdge(edge, sub)) {
    return false;
  }

  sub.state = state | MAYBE_CHANGE_STATE | ReactiveNodeState.Visited;
  return true;
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
  const stack = new Array<ReactiveEdge | null>();
  const base = stack.length;
  let sp = stack.length;
  let edge: ReactiveEdge = startEdge;
  let next: ReactiveEdge | null = startEdge.nextOut;

  while (true) {
    const sub: ReactiveNode = edge.to;

    const marked = markSubscriber(edge, sub);

    if (!marked) {
      if (next !== null) {
        edge = next;
        next = edge.nextOut;
        continue;
      }

      if (sp === base) {
        break;
      }

      edge = stack[--sp]!;
      next = edge.nextOut;
      continue;
    }

    if (sub.kind === ReactiveNodeKind.Effect) {
      runtime.notifyEffectInvalidated(sub);
    } else {
      const child = sub.firstOut;

      if (child !== null) {
        if (next !== null) {
          stack[sp++] = next;
        }

        edge = child;
        next = child.nextOut;
        continue;
      }
    }

    if (next !== null) {
      edge = next;
      next = edge.nextOut;
      continue;
    }

    if (sp === base) {
      break;
    }

    edge = stack[--sp]!;
    next = edge.nextOut;
  }
}
