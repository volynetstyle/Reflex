import { recompute } from "../engine/compute";
import type { ReactiveEdge, ReactiveNode } from "../shape";
import { Changed, Invalid } from "../shape";
import { propagateOnce } from "./propagate.once";
import {
  noteShouldRecomputeStackUsage,
  readRuntimeWalkerStackStats,
  trimWalkerStackIfSparse,
} from "./stack.stats";

/**
 * Shared traversal stack.
 *
 * Used by walkLine / walkBranch to avoid per-call allocations.
 * `high` marks the current top used by nested/reentrant walks.
 */
const stack: ReactiveEdge[] = [];
let high = 0;

function pushStack(edge: ReactiveEdge, top: number): number {
  stack[top++] = edge;
  if (__DEV__) noteShouldRecomputeStackUsage(top);
  return top;
}

function restoreStackBase(base: number): void {
  high = base;
  trimWalkerStackIfSparse(stack, base);
}

/**
 * Walk result:
 *
 * CLEAN - dependency chain is stable, no recomputation changed value.
 * DIRTY - some dependency changed and current consumer should recompute.
 * BAIL  - fast linear path encountered branching and should fallback.
 */
export const CLEAN = 0;
export const DIRTY = 1;
export const BAIL = 2;

export function readShouldRecomputeStackStats(): {
  shouldRecompute: { current: number; peak: number; capacity: number };
  propagate: { current: number; peak: number; capacity: number };
} {
  return readRuntimeWalkerStackStats(high, stack.length, 0, 0);
}

/**
 * Recompute `node` and, if it changed, propagate dirtiness to its outgoing users.
 *
 * `edge` must be an outgoing edge from `node`.
 */
function refresh(node: ReactiveNode, edge: ReactiveEdge): boolean {
  if (__DEV__ && edge.from !== node) {
    throw new Error("refresh invariant violation");
  }

  const changed = recompute(node);

  // Only propagate if this node has side-fanout.
  // A single direct parent is handled by the current walk.
  if (changed && (edge.prevOut !== null || edge.nextOut !== null)) {
    propagateOnce(node);
  }

  return changed;
}

/**
 * Clear Invalid flag for the current node and all nodes collected on stack
 * between `base` and `top`.
 *
 * Used when the walk proves that the inspected dependency path is clean.
 */
function clearInvalid(node: ReactiveNode, top: number, base: number): void {
  node.state &= ~Invalid;

  while (top > base) {
    stack[--top]!.to.state &= ~Invalid;
  }

  restoreStackBase(base);
}

/**
 * Fast-path walker for a linear dependency chain.
 *
 * It follows `edge.from` while every visited node has at most one dependency.
 * If branching is detected, returns BAIL so the caller can fallback to
 * `walkBranch`.
 *
 * Intended for the common runtime case:
 *
 *   source -> memo -> memo -> effect
 *
 * where the dependency path is narrow and can be resolved without full DFS.
 */
export function walkLine(node: ReactiveNode, edge: ReactiveEdge): number {
  const base = high;
  let top = base;
  let dirty = false;

  while (true) {
    // Current node is already known changed.
    if ((node.state & Changed) !== 0) {
      dirty = true;
      break;
    }

    const dep = edge.from;
    const state = dep.state;

    // Direct dependency changed.
    // Pull it now and decide whether this path is dirty.
    if ((state & Changed) !== 0) {
      high = top;
      dirty = refresh(dep, edge);
      break;
    }

    // Dependency is invalid, so it may need to be pulled.
    if ((state & Invalid) !== 0) {
      const deps = dep.firstIn;

      if (deps !== null) {
        // More than one dependency means this is no longer a line.
        if (deps.nextIn !== null) {
          restoreStackBase(base);
          return BAIL;
        }

        // Descend one level.
        top = pushStack(edge, top);
        edge = deps;
        node = dep;
        continue;
      }

      // Invalid leaf: recompute directly.
      high = top;
      dirty = refresh(dep, edge);
      break;
    }

    // Current dependency is clean, but there are siblings.
    // Linear walker cannot prove the whole branch clean.
    if (edge.nextIn !== null) {
      restoreStackBase(base);
      return BAIL;
    }

    clearInvalid(node, top, base);
    return CLEAN;
  }

  // Recompute happened but value stayed equal.
  if (!dirty) {
    clearInvalid(node, top, base);
    return CLEAN;
  }

  // Bubble the change back up through the saved parent edges.
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

  restoreStackBase(base);
  return DIRTY;
}

/**
 * Full dependency walker for branching graphs.
 *
 * Performs an iterative DFS over invalid dependencies.
 *
 * Returns:
 * - false when all inspected dependencies are clean/stable;
 * - true when some dependency changed and the current consumer is dirty.
 *
 * This is the slower but complete fallback for shapes like:
 *
 *        a
 *       / \
 *      b   c
 *       \ /
 *        d
 */
export function walkBranch(node: ReactiveNode, edge: ReactiveEdge): boolean {
  const base = high;
  let top = base;
  let dirty = false;

  scan: while (true) {
    /**
     * Descend until we find:
     * - a changed node,
     * - an invalid leaf,
     * - or a clean subtree.
     */
    while (true) {
      if ((node.state & Changed) !== 0) {
        dirty = true;
        break;
      }

      const dep = edge.from;
      const state = dep.state;

      if ((state & Changed) !== 0) {
        high = top;
        dirty = refresh(dep, edge);
        break;
      }

      if ((state & Invalid) !== 0) {
        const deps = dep.firstIn;

        if (deps !== null) {
          // Descend into dependency subtree.
          top = pushStack(edge, top);
          edge = deps;
          node = dep;

          // Multiple deps: continue DFS scan.
          if (deps.nextIn !== null) {
            continue scan;
          }

          continue;
        }

        // Invalid leaf.
        high = top;
        dirty = refresh(dep, edge);
        break;
      }

      // Current dep is clean. Try sibling dependency.
      const next = edge.nextIn;
      if (next !== null) {
        edge = next;
        continue scan;
      }

      // No siblings: this node's dependency subtree is clean.
      node.state &= ~Invalid;

      if (top === base) {
        restoreStackBase(base);
        return false;
      }

      // Ascend to parent and continue with its siblings.
      const parent = stack[--top]!;
      high = top;
      node = parent.to;

      const parentNext = parent.nextIn;
      if (parentNext !== null) {
        edge = parentNext;
        continue scan;
      }
    }

    /**
     * If recomputation did not produce a changed value,
     * continue scanning siblings before deciding the parent is clean.
     */
    if (!dirty) {
      const next = edge.nextIn;
      if (next !== null) {
        edge = next;
        continue;
      }

      node.state &= ~Invalid;
    }

    /**
     * Bubble dirty state upward.
     *
     * Each parent is recomputed only if the child below it changed.
     */
    while (top > base && dirty) {
      const parent = stack[--top]!;
      high = top;

      dirty = refresh(node, parent);
      node = parent.to;

      // Parent recomputed but value stayed equal.
      // Continue with sibling dependencies if they exist.
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

    /**
     * Ascend through clean parents.
     *
     * If a parent still has unchecked sibling dependencies,
     * resume scanning from there.
     */
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

    restoreStackBase(base);
    return dirty;
  }
}
