import { recompute } from "../engine";
import type { ReactiveEdge, ReactiveNode } from "../shape";
import { Changed, Invalid } from "../shape";
import { propagateOnce } from "./propagate.once";

const stack: ReactiveEdge[] = [];
let high = 0;

export const CLEAN = 0;
export const DIRTY = 1;
export const BAIL = 2;

function refresh(node: ReactiveNode, edge: ReactiveEdge): boolean {
  if (__DEV__ && edge.from !== node) {
    throw new Error("refresh invariant violation");
  }

  const changed = recompute(node);

  if (changed && (edge.prevOut !== null || edge.nextOut !== null)) {
    propagateOnce(node);
  }

  return changed;
}

function clearInvalid(node: ReactiveNode, top: number, base: number): void {
  node.state &= ~Invalid;

  if (top !== base) {
    while (top > base) {
      stack[--top]!.to.state &= ~Invalid;
    }
  }

  high = base;
}

export function walkLine(node: ReactiveNode, edge: ReactiveEdge): number {
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
      dirty = refresh(dep, edge);
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

      dirty = refresh(dep, edge);
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
    dirty = refresh(node, parent);
    node = parent.to;

    if (!dirty) {
      clearInvalid(node, top, base);
      return CLEAN;
    }
  }

  high = base;
  return DIRTY;
}

export function walkBranch(node: ReactiveNode, edge: ReactiveEdge): boolean {
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
        dirty = refresh(dep, edge);
        break;
      }

      if ((state & Invalid) !== 0) {
        const deps = dep.firstIn;

        if (deps !== null) {
          stack[top++] = edge;
          high = top;
          edge = deps;
          node = dep;

          if (deps.nextIn !== null) {
            continue scan;
          }

          continue;
        }

        dirty = refresh(dep, edge);
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
      high = top;
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

    while (top > base && dirty) {
      const parent = stack[--top]!;
      high = top;

      dirty = refresh(node, parent);
      node = parent.to;

      if (!dirty) {
        const next = parent.nextIn;
        if (next !== null) {
          edge = next;
          continue scan;
        }

        node.state &= ~Invalid;
        break;
      }
    }

    while (top > base) {
      const parent = stack[--top]!;
      high = top;

      const next = parent.nextIn;
      if (next !== null) {
        edge = next;
        continue scan;
      }

      node.state &= ~Invalid;
      node = parent.to;
    }

    high = base;
    return dirty;
  }
}
