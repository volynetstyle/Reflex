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

function settleDirtySource(node: ReactiveNode, link: ReactiveEdge): boolean {
  const isSignal = (node.state & ReactiveNodeState.Producer) !== 0;
  const changed = isSignal ? changePayload(node) : recompute(node);

  if (!changed) return false;

  if (!isSignal && (link.prevOut !== null || link.nextOut !== null)) {
    propagateOnce(node);
  }

  return true;
}

function unwindDirtyStack(
  sub: ReactiveNode,
  needRecompute: boolean,
  stack: ReactiveEdge[],
  baseTop: number,
): boolean {
  while (dirtyCheckStackTop > baseTop) {
    const parentLink = stack[dirtyCheckStackTop--]!;

    if (needRecompute) {
      needRecompute = settleDirtySource(sub, parentLink);
    } else {
      sub.state &= ~ReactiveNodeState.Invalid;
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
  baseTop: number,
): boolean {
  top: do {
    const dep = link.from;
    const depState = dep.state;

    if (sub.state & ReactiveNodeState.Changed) {
      needRecompute = true;
    } else if (depState & ReactiveNodeState.Changed) {
      needRecompute = settleDirtySource(dep, link) || needRecompute;
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
    }

    while (dirtyCheckStackTop > baseTop) {
      const parentLink = stack[dirtyCheckStackTop--]!;

      if (needRecompute) {
        needRecompute = settleDirtySource(sub, parentLink);
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
}

function shouldRecomputeSingleDependency(
  node: ReactiveNode,
  firstLink: ReactiveEdge,
  stack: ReactiveEdge[],
  baseTop: number,
): boolean {
  let link = firstLink;
  let sub = node;
  let needRecompute = false;

  while (true) {
    const dep = link.from;
    const depState = dep.state;

    if (sub.state & ReactiveNodeState.Changed) {
      needRecompute = true;
      break;
    }

    if (depState & ReactiveNodeState.Changed) {
      needRecompute = settleDirtySource(dep, link);
      break;
    }

    if (
      (depState & ReactiveNodeState.Producer) === 0 &&
      (depState & DIRTY_STATE) !== 0
    ) {
      const depFirstIn = dep.firstIn!;

      if (depFirstIn.nextIn !== null) {
        stack[++dirtyCheckStackTop] = link;
        return shouldRecomputeBranching(
          depFirstIn,
          dep,
          needRecompute,
          stack,
          baseTop,
        );
      }

      stack[++dirtyCheckStackTop] = link;
      link = depFirstIn;
      sub = dep;
      continue;
    }

    sub.state &= ~ReactiveNodeState.Invalid;
    break;
  }

  return unwindDirtyStack(sub, needRecompute, stack, baseTop);
}

/**
 * Pull-side depth-first walk over incoming dependencies.
 * Refreshes only pending/changed branches; exits early on first stale source.
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

  try {
    return firstIn.nextIn === null
      ? shouldRecomputeSingleDependency(node, firstIn, stack, baseTop)
      : shouldRecomputeBranching(firstIn, node, false, stack, baseTop);
  } finally {
    dirtyCheckStackTop = baseTop;
    stack.length = baseTop + 1;
  }
}
