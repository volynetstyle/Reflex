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

export function propagateOnce(node: ReactiveNode): void {
  let thrown: unknown = null;

  for (let edge = node.firstOut; edge !== null; edge = edge.nextOut) {
    const sub = edge.to;
    const subState = sub.state;

    if ((subState & DIRTY_STATE) !== ReactiveNodeState.Invalid) {
      continue;
    }

    sub.state =
      (subState & ~ReactiveNodeState.Invalid) | ReactiveNodeState.Changed;

    if (sub.state & ReactiveNodeState.Watcher) {
      try {
        runtime.dispatchWatcherEvent(sub);
      } catch (error) {
        thrown ??= error;
      }
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
export function propagate(startEdge: ReactiveEdge): void {
  const stack = runtime.propagateStack;
  const baseTop = propagateStackTop;
  let edge = startEdge;
  let resumeEdge: ReactiveEdge | null = startEdge.nextOut;
  let thrown: unknown = null;

  try {
    top: do {
      const sub = edge.to;
      const state = sub.state;
      let marked = false;

      if (
        (state & DIRTY_STATE) === 0 &&
        (state & ReactiveNodeState.Disposed) === 0
      ) {
        if ((state & WALKER_STATE) === 0) {
          sub.state = state | ReactiveNodeState.Invalid;
          marked = true;
        } else if ((state & ReactiveNodeState.Tracking) === 0) {
          sub.state =
            (state & ~ReactiveNodeState.Visited) | ReactiveNodeState.Invalid;
          marked = true;
        } else {
          for (
            let trackedEdge = sub.depsTail;
            trackedEdge !== null;
            trackedEdge = trackedEdge.prevIn
          ) {
            if (trackedEdge !== edge) continue;
            sub.state =
              state | ReactiveNodeState.Visited | ReactiveNodeState.Invalid;
            marked = true;
            break;
          }
        }
      }

      if (marked) {
        if (sub.state & ReactiveNodeState.Watcher) {
          try {
            runtime.dispatchWatcherEvent(sub);
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
