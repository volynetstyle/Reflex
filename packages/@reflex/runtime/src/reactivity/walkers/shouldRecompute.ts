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

function settleDirtySource(node: ReactiveNode, link: ReactiveEdge): boolean {
  const isSignal = (node.state & ReactiveNodeState.Producer) !== 0;
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
  base: number,
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
  base: number,
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
        stack.push(link);
        return shouldRecomputeBranching(
          depFirstIn,
          dep,
          needRecompute,
          stack,
          base,
        );
      }

      stack.push(link);
      link = depFirstIn;
      sub = dep;
      continue;
    }

    sub.state &= ~ReactiveNodeState.Invalid;
    break;
  }

  return unwindDirtyStack(sub, needRecompute, stack, base);
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
  const base = stack.length;

  const result =
    firstIn.nextIn === null
      ? shouldRecomputeSingleDependency(node, firstIn, stack, base)
      : shouldRecomputeBranching(firstIn, node, false, stack, base);

  stack.length = base;

  return result;
}
