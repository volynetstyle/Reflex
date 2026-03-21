import { changePayload } from "../engine";
import { recompute } from "../engine/compute";
import {
  CHANGED_STATE,
  DIRTY_STATE,
  MAYBE_CHANGE_STATE,
  type ReactiveEdge,
  ReactiveNode,
  ReactiveNodeKind,
} from "../shape";
import { propagateOnce } from "./propagate";

function settleDirtySource(node: ReactiveNode, link: ReactiveEdge): boolean {
  const isSignal = node.kind === ReactiveNodeKind.Signal;
  const changed = isSignal ? changePayload(node) : recompute(node);

  if (!changed) {
    node.state &= ~DIRTY_STATE;
    return false;
  }

  if (!isSignal && (link.prevOut !== null || link.nextOut !== null)) {
    propagateOnce(node);
  }

  return true;
}

/**
 * Pull-side depth-first walk over incoming dependencies.
 * Refreshes only pending/changed branches; exits early on first stale source.
 */
export function shouldRecompute(node: ReactiveNode): boolean {
  if (node.kind === ReactiveNodeKind.Signal) return false;
  if ((node.state & CHANGED_STATE) !== 0) return true;

  const firstLink = node.firstIn;
  if (firstLink === null) {
    node.state &= ~MAYBE_CHANGE_STATE;
    return false;
  }

  const stack: ReactiveEdge[] = [];
  let link = firstLink;
  let sub = node;
  let needRecompute = false;

  top: do {
    const dep = link.from;
    const depState = dep.state;

    if ((sub.state & CHANGED_STATE) !== 0) {
      needRecompute = true;
    } else if ((depState & CHANGED_STATE) !== 0) {
      if (settleDirtySource(dep, link)) needRecompute = true;
    } else if (
      (depState & DIRTY_STATE) !== 0 &&
      dep.kind !== ReactiveNodeKind.Signal
    ) {
      stack.push(link);
      link = dep.firstIn!;
      sub = dep;
      continue;
    }

    if (!needRecompute) {
      if (link.nextIn !== null) {
        link = link.nextIn;
        continue;
      }
    }

    while (stack.length > 0) {
      const parentLink = stack.pop()!;

      if (needRecompute) {
        needRecompute = settleDirtySource(sub, parentLink);
      } else {
        sub.state &= ~MAYBE_CHANGE_STATE;
      }

      sub = parentLink.to;
      link = parentLink;

      if (!needRecompute && link.nextIn !== null) {
        link = link.nextIn;
        continue top;
      }
    }

    return needRecompute;
  } while (true);
}
