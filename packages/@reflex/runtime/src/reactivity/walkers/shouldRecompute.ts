import runtime from "../context";
import { recompute } from "../engine/compute";
import { changePayload } from "../engine/changePayload";
import {
  CHANGED_STATE,
  DIRTY_STATE,
  MAYBE_CHANGE_STATE,
  type ReactiveEdge,
  ReactiveNode,
  ReactiveNodeKind,
} from "../shape";
import { propagateOnce } from "./propagate";

function settleDirtySource(
  node: ReactiveNode,
  hasSiblingSubscribers: boolean,
): boolean {
  const isSignal = node.kind === ReactiveNodeKind.Signal;
  let changed = false;

  if (isSignal) changed = changePayload(node);
  else changed = recompute(node);

  if (!changed) {
    node.state &= ~DIRTY_STATE;
    return false;
  }

  if (hasSiblingSubscribers && !isSignal) {
    propagateOnce(node);
  }

  return true;
}

/**
 * Pull-side depth-first walk over incoming dependencies.
 * The walk refreshes only the branches that are already marked pending/changed
 * and exits early as soon as one source proves the current node stale.
 */
export function shouldRecompute(node: ReactiveNode): boolean {
  if (node.kind === ReactiveNodeKind.Signal) {
    return false;
  }

  if ((node.state & CHANGED_STATE) !== 0) {
    return true;
  }

  const firstLink = node.firstIn;
  if (firstLink === null) {
    node.state &= ~MAYBE_CHANGE_STATE;
    return false;
  }

  const stack = new Array<ReactiveEdge | null>();
  let sp = stack.length;
  let link: ReactiveEdge = firstLink;
  let sub = node;
  let checkDepth = 0;
  let needRecompute = false;

  top: do {
    const dep = link.from;
    const subState = sub.state;

    if ((subState & CHANGED_STATE) !== 0) {
      needRecompute = true;
    } else {
      const depState = dep.state;

      if ((depState & DIRTY_STATE) !== 0) {
        const depKind = dep.kind;

        if ((depState & CHANGED_STATE) !== 0) {
          if (
            settleDirtySource(
              dep,
              depKind !== ReactiveNodeKind.Signal &&
                (link.prevOut !== null || link.nextOut !== null),
            )
          ) {
            needRecompute = true;
          }
        } else if (depKind !== ReactiveNodeKind.Signal) {
          if (link.prevOut !== null || link.nextOut !== null) {
            stack[sp++] = link;
          }

          link = dep.firstIn!;
          sub = dep;
          ++checkDepth;
          continue;
        }
      }
    }

    if (!needRecompute) {
      const nextDep = link.nextIn;
      if (nextDep !== null) {
        link = nextDep;
        continue;
      }
    }

    while (checkDepth) {
      --checkDepth;

      const firstSub = sub.firstOut!;
      const hasSiblingSubscribers = firstSub.nextOut !== null;
      link = hasSiblingSubscribers ? stack[--sp]! : firstSub;

      if (needRecompute) {
        needRecompute = settleDirtySource(sub, hasSiblingSubscribers);
      } else {
        sub.state &= ~MAYBE_CHANGE_STATE;
      }

      sub = link.to;
      if (needRecompute) {
        continue;
      }

      const nextDep = link.nextIn;
      if (nextDep !== null) {
        link = nextDep;
        continue top;
      }
    }

    return needRecompute;
  } while (true);
}
