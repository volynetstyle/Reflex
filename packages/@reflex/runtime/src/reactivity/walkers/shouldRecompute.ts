import { recompute } from "../engine/compute";
import {
  DIRTY_STATE,
  clearDirtyState,
  type ReactiveEdge,
  ReactiveNode,
  ReactiveNodeState,
} from "../shape";
import { propagateOnce } from "./propagate";

// Fanout matters only when the dependency has multiple subscribers. In that
// case a confirmed change must eagerly promote other invalid subscribers too.
function hasFanout(link: ReactiveEdge): boolean {
  return link.prevOut !== null || link.nextOut !== null;
}

function refreshDependency(link: ReactiveEdge, node: ReactiveNode): boolean {
  if ((node.state & ReactiveNodeState.Producer) !== 0) {
    const changed = (node.state & ReactiveNodeState.Changed) !== 0;

    clearDirtyState(node);
    return changed;
  }

  const changed = recompute(node);

  if (changed && hasFanout(link)) {
    propagateOnce(node);
  }

  return changed;
}

/**
 * Pull-side depth-first walk over incoming dependencies.
 * It starts at the current incoming edge, stays on the cheap single-link path
 * while there are no sibling deps to inspect, and only escalates into stack-
 * backed branch traversal when a dirty dependency must be descended into.
 */
export function shouldRecompute(node: ReactiveNode): boolean {
  const state = node.state;

  // Producers commit eagerly on write and do not participate in pull-side
  // dependency walks.
  if ((state & ReactiveNodeState.Producer) !== 0) return false;
  // A node already marked Changed definitely needs recompute.
  if ((state & ReactiveNodeState.Changed) !== 0) return true;

  const firstIn = node.firstIn;
  if (firstIn === null) {
    // No dependencies means there is nothing upstream left to inspect. Clearing
    // Invalid keeps the node stable until its own compute is touched again.
    node.state = state & ~ReactiveNodeState.Invalid;
    return false;
  }

  // Stores parent links for returning to a consumer after finishing a dependency.
  // This differs from propagate's resume-edge stack and must not be shared.
  let dirtyCheckStackTop = -1;
  const stack: ReactiveEdge[] = [];
  let link = firstIn;
  let sub = node;
  let needRecompute = false;

  while (true) {
    const dep = link.from;
    const depState = dep.state;

    if ((sub.state & ReactiveNodeState.Changed) !== 0) {
      // Once the current consumer itself is confirmed changed, its remaining
      // incoming siblings no longer matter for the "should this node rerun?"
      // question, but we still need to unwind the DFS stack correctly.
      needRecompute = true;
    } else if ((depState & ReactiveNodeState.Changed) !== 0) {
      // A directly changed dependency can answer immediately: producers are
      // already committed, computed deps recompute themselves on demand.
      needRecompute = refreshDependency(link, dep) || needRecompute;
    } else if (
      (depState & ReactiveNodeState.Producer) === 0 &&
      (depState & DIRTY_STATE) !== 0
    ) {
      const depFirstIn = dep.firstIn;

      if (depFirstIn !== null) {
        // Descend into the dirty computed dependency. The current incoming link
        // becomes a return point so we can resume this consumer afterwards.
        stack[++dirtyCheckStackTop] = link;
        link = depFirstIn;
        sub = dep;
        continue;
      }

      // Dirty computed with no current deps still must rerun once to refresh
      // its value and clean its state.
      needRecompute = refreshDependency(link, dep) || needRecompute;
    }

    if (!needRecompute) {
      const nextLink = link.nextIn;

      if (nextLink !== null) {
        // Stay on the cheap linear path while this consumer still has siblings
        // to inspect and no confirmed upstream change has been found.
        link = nextLink;
        continue;
      }

      // Every dependency under the current consumer checked out clean, so the
      // node is no longer invalid.
      sub.state &= ~ReactiveNodeState.Invalid;
    }

    let resumedSibling = false;
    while (dirtyCheckStackTop >= 0) {
      // Pop one parent frame and decide whether that parent now needs to rerun
      // because the child subtree we just finished actually changed.
      const parentLink = stack[dirtyCheckStackTop--]!;

      if (needRecompute) {
        // Propagate only whether this direct dependency changed for its parent.
        // Descendant churn that settles to the same value must stop here.
        needRecompute = refreshDependency(parentLink, sub);
      } else {
        sub.state &= ~ReactiveNodeState.Invalid;
      }

      sub = parentLink.to;
      link = parentLink;

      if (!needRecompute) {
        const nextLink = link.nextIn;

        if (nextLink !== null) {
          // Parent stayed stable, so resume its remaining sibling deps before
          // unwinding any farther up the DFS stack.
          link = nextLink;
          resumedSibling = true;
          break;
        }
      }
    }

    if (!resumedSibling) {
      return needRecompute;
    }
  }
}
