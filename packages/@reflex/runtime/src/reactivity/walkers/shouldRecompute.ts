import { changePayload } from "../engine";
import { recompute } from "../engine/compute";
import runtime from "../context";
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

function unwindDirtyStack(
  sub: ReactiveNode,
  needRecompute: boolean,
  stack: ReactiveEdge[],
  base: number,
): boolean {
  while (stack.length > base) {
    const parentLink = stack.pop()!;

    if (needRecompute) {
      needRecompute = settleDirtySource(sub, parentLink);
    } else {
      sub.state &= ~MAYBE_CHANGE_STATE;
    }

    sub = parentLink.to;
  }

  return needRecompute;
}

function shouldRecomputeBranching(
  link: ReactiveEdge,
  sub: ReactiveNode,
  needRecompute: boolean,
  stack: ReactiveEdge[],
  base: number,
): boolean {
  top: do {
    const dep = link.from;
    const depState = dep.state;

    if ((sub.state & CHANGED_STATE) !== 0) {
      needRecompute = true;
    } else if ((depState & CHANGED_STATE) !== 0) {
      needRecompute = settleDirtySource(dep, link) || needRecompute;
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
      const nextLink = link.nextIn;

      if (nextLink !== null) {
        link = nextLink;
        continue;
      }
    }

    while (stack.length > base) {
      const parentLink = stack.pop()!;

      if (needRecompute) {
        needRecompute = settleDirtySource(sub, parentLink);
      } else {
        sub.state &= ~MAYBE_CHANGE_STATE;
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
}

function shouldRecomputeSingleDependency(
  node: ReactiveNode,
  firstLink: ReactiveEdge,
  stack: ReactiveEdge[],
  base: number,
): boolean {
  let link = firstLink;
  let sub = node;
  let needRecompute = false;

  while (true) {
    const dep = link.from;
    const depState = dep.state;

    if ((sub.state & CHANGED_STATE) !== 0) {
      needRecompute = true;
      break;
    }

    if ((depState & CHANGED_STATE) !== 0) {
      needRecompute = settleDirtySource(dep, link);
      break;
    }

    if ((depState & DIRTY_STATE) !== 0 && dep.kind !== ReactiveNodeKind.Signal) {
      const depFirstIn = dep.firstIn!;

      if (depFirstIn.nextIn !== null) {
        stack.push(link);
        return shouldRecomputeBranching(depFirstIn, dep, needRecompute, stack, base);
      }

      stack.push(link);
      link = depFirstIn;
      sub = dep;
      continue;
    }

    sub.state &= ~MAYBE_CHANGE_STATE;
    break;
  }

  return unwindDirtyStack(sub, needRecompute, stack, base);
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

  const stack = runtime.dirtyCheckStack;
  const base = stack.length;

  try {
    if (firstLink.nextIn === null) {
      return shouldRecomputeSingleDependency(node, firstLink, stack, base);
    }

    return shouldRecomputeBranching(firstLink, node, false, stack, base);
  } finally {
    stack.length = base;
  }
}
