import type { ReactiveEdge, ReactiveNode } from "../shape";
import { Changed, Invalid } from "../shape";
import { refreshAndPropagateIfNeeded } from "./recompute.refresh";

const stack: ReactiveEdge[] = [];
let high = 0;

const CLEAN = 0;
const DIRTY = 1;
const BAIL = 2;

function refresh(
  node: ReactiveNode,
  edge: ReactiveEdge,
  base: number,
): boolean {
  try {
    return refreshAndPropagateIfNeeded(
      node,
      edge.prevOut !== null || edge.nextOut !== null,
    );
  } catch (error) {
    high = base;
    throw error;
  }
}

function clearInvalid(
  node: ReactiveNode,
  top: number,
  base: number,
): void {
  node.state &= ~Invalid;

  while (top > base) {
    stack[--top]!.to.state &= ~Invalid;
  }

  high = base;
}

function walkLine(node: ReactiveNode, edge: ReactiveEdge): number {
  const base = high;
  let top = base;
  let dirty = false;

  while (true) {
    if ((node.state & Changed) !== 0) {
      dirty = true;
      break;
    }

    const dep = edge.from;
    const state = dep.state;

    if ((state & Changed) !== 0) {
      dirty = refresh(dep, edge, base);
      break;
    }

    if ((state & Invalid) !== 0) {
      const deps = dep.firstIn;

      if (deps !== null) {
        if (deps.nextIn !== null) {
          high = base;
          return BAIL;
        }

        stack[top++] = edge;
        high = top;
        edge = deps;
        node = dep;
        continue;
      }

      dirty = refresh(dep, edge, base);
      break;
    }

    if (edge.nextIn !== null) {
      high = base;
      return BAIL;
    }

    clearInvalid(node, top, base);
    return CLEAN;
  }

  if (!dirty) {
    clearInvalid(node, top, base);
    return CLEAN;
  }

  while (top > base) {
    const parent = stack[--top]!;
    high = top;
    dirty = refresh(node, parent, base);
    node = parent.to;

    if (!dirty) {
      clearInvalid(node, top, base);
      return CLEAN;
    }
  }

  high = base;
  return DIRTY;
}

export function shouldRecomputeWalk(
  node: ReactiveNode,
  edge: ReactiveEdge,
): boolean {
  if (edge.nextIn === null) {
    const dirty = walkLine(node, edge);
    if (dirty !== BAIL) return dirty === DIRTY;
  }

  return walkBranch(node, edge);
}

function walkBranch(node: ReactiveNode, edge: ReactiveEdge): boolean {
  const base = high;
  let top = base;
  let dirty = false;

  scan: while (true) {
    while (true) {
      if ((node.state & Changed) !== 0) {
        dirty = true;
        break;
      }

      const dep = edge.from;
      const state = dep.state;

      if ((state & Changed) !== 0) {
        dirty = refresh(dep, edge, base);
        break;
      }

      if ((state & Invalid) !== 0) {
        const deps = dep.firstIn;

        if (deps !== null) {
          stack[top++] = edge;
          high = top;
          edge = deps;
          node = dep;
          if (deps.nextIn === null) continue;
          continue scan;
        }

        dirty = refresh(dep, edge, base);
        break;
      }

      const next = edge.nextIn;
      if (next !== null) {
        edge = next;
        continue scan;
      }

      node.state &= ~Invalid;

      if (top === base) {
        high = base;
        return false;
      }

      const parent = stack[--top]!;
      node = parent.to;

      const parentNext = parent.nextIn;
      if (parentNext !== null) {
        edge = parentNext;
        continue scan;
      }
    }

    if (!dirty) {
      const next = edge.nextIn;
      if (next !== null) {
        edge = next;
        continue;
      }
      node.state &= ~Invalid;
    }

    while (top > base) {
      const parent = stack[--top]!;
      high = top;

      if (dirty) {
        dirty = refresh(node, parent, base);
      } else {
        const next = parent.nextIn;
        if (next !== null) {
          edge = next;
          continue scan;
        }
        node.state &= ~Invalid;
      }

      node = parent.to;
    }

    high = base;
    return dirty;
  }
}
