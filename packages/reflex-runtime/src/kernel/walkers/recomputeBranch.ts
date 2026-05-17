import type { ReactiveEdge, ReactiveNode } from "../shape";
import { Changed, Invalid } from "../shape";
import { refresh } from "./ensureFresh";
import {
  getRecomputeStackBase,
  pushRecomputeStack,
  readRecomputeStack,
  releaseRecomputeStackBase,
  setRecomputeStackHigh,
} from "./walkerStack";
export { BAIL, CLEAN, DIRTY } from "./walkerConstants";
export { walkLine } from "./recomputeLine";
export { readShouldRecomputeStackStats } from "./walkerStack";

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
  const base = getRecomputeStackBase();
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
        setRecomputeStackHigh(top);
        dirty = refresh(dep);
        break;
      }

      if ((state & Invalid) !== 0) {
        const deps = dep.firstIn;

        if (deps !== null) {
          // Descend into dependency subtree.
          top = pushRecomputeStack(edge, top);
          edge = deps;
          node = dep;

          // Multiple deps: continue DFS scan.
          if (deps.nextIn !== null) {
            continue scan;
          }

          continue;
        }

        // Invalid leaf.

        setRecomputeStackHigh(top);
        dirty = refresh(dep);
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
        releaseRecomputeStackBase(base);
        return false;
      }

      // Ascend to parent and continue with its siblings.
      const parent = readRecomputeStack(--top);
      setRecomputeStackHigh(top);
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
      const parent = readRecomputeStack(--top);
      setRecomputeStackHigh(top);

      dirty = refresh(node);
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
      const parent = readRecomputeStack(--top);
      setRecomputeStackHigh(top);

      const next = parent.nextIn;
      if (next !== null) {
        edge = next;
        continue scan;
      }

      node.state &= ~Invalid;
      node = parent.to;
    }

    releaseRecomputeStackBase(base);
    return dirty;
  }
}
