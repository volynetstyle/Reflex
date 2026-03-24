import { changePayload } from "../engine";
import { recompute } from "../engine/compute";
import runtime from "../context";
import {
  DIRTY_STATE,
  type ReactiveEdge,
  ReactiveNode,
  ReactiveNodeState,
} from "../shape";
import { propagateOnce } from "./propagate";

// Stores parent links for returning to a consumer after finishing a dependency.
// This differs from propagate's resume-edge stack and must not be shared.
let dirtyCheckStackTop = -1;

/**
 * Pull-side depth-first walk over incoming dependencies.
 * It starts at the current incoming edge, stays on the cheap single-link path
 * while there are no sibling deps to inspect, and only escalates into stack-
 * backed branch traversal when a dirty dependency must be descended into.
 */
export function shouldRecompute(node: ReactiveNode): boolean {
  const state = node.state;

  if ((state & ReactiveNodeState.Producer) !== 0) return false;
  if ((state & ReactiveNodeState.Changed) !== 0) return true;

  const firstIn = node.firstIn;
  if (firstIn === null) {
    node.state = state & ~ReactiveNodeState.Invalid;
    return false;
  }

  const stack = runtime.dirtyCheckStack;
  const baseTop = dirtyCheckStackTop;
  let link = firstIn;
  let sub = node;
  let needRecompute = false;

  try {
    top: do {
      const dep = link.from;
      const depState = dep.state;

      if ((sub.state & ReactiveNodeState.Changed) !== 0) {
        needRecompute = true;
      } else if ((depState & ReactiveNodeState.Changed) !== 0) {
        const isSignal = (depState & ReactiveNodeState.Producer) !== 0;
        const changed = isSignal ? changePayload(dep) : recompute(dep);

        if (changed && !isSignal && (link.prevOut !== null || link.nextOut !== null)) {
          propagateOnce(dep);
        }

        needRecompute = changed || needRecompute;
      } else if (
        (depState & ReactiveNodeState.Producer) === 0 &&
        (depState & DIRTY_STATE) !== 0
      ) {
        stack[++dirtyCheckStackTop] = link;
        link = dep.firstIn!;
        sub = dep;
        continue;
      }

      if (!needRecompute) {
        const nextLink = link.nextIn;

        if (nextLink !== null) {
          link = nextLink;
          continue;
        }

        sub.state &= ~ReactiveNodeState.Invalid;
      }

      while (dirtyCheckStackTop > baseTop) {
        const parentLink = stack[dirtyCheckStackTop--]!;
        const isSignal = (sub.state & ReactiveNodeState.Producer) !== 0;

        if (needRecompute) {
          const changed = isSignal ? changePayload(sub) : recompute(sub);

          if (
            changed &&
            !isSignal &&
            (parentLink.prevOut !== null || parentLink.nextOut !== null)
          ) {
            propagateOnce(sub);
          }

          needRecompute = changed;
        } else {
          sub.state &= ~ReactiveNodeState.Invalid;
        }

        sub = parentLink.to;
        link = parentLink;

        if (!needRecompute) {
          const nextLink = link.nextIn;

          if (nextLink !== null) {
            link = nextLink;
            continue top;
          }
        }
      }

      return needRecompute;
    } while (true);
  } finally {
    dirtyCheckStackTop = baseTop;
    stack.length = baseTop + 1;
  }
}
