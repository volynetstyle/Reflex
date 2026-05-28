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
export { readShouldRecomputeStackStats } from "./walkerStack";

/**
 * Dependency walker for dirty dependency links.
 *
 * The same loop handles straight chains and branching shapes: descend through
 * pending dependencies, resume siblings when a branch is stable, and bubble
 * confirmed changes upward.
 */
export function walkBranch(node: ReactiveNode, edge: ReactiveEdge): boolean {
  const base = /**@__INLINE__*/ getRecomputeStackBase();
  let top = base;
  let changed = false;

  scan: do {
    const dep = edge.from;
    const state = dep.state;

    if ((node.state & Changed) !== 0) {
      changed = true;
    } else if ((state & Changed) !== 0) {
      setRecomputeStackHigh(top);
      changed = refresh(dep);
    } else if ((state & Invalid) !== 0) {
      const deps = dep.firstIn;

      if (deps !== null) {
        top = /**@__INLINE__*/ pushRecomputeStack(edge, top);
        edge = deps;
        node = dep;
        continue;
      }

      /**@__INLINE__*/ setRecomputeStackHigh(top);
      changed = refresh(dep);
    }

    if (!changed) {
      const next = edge.nextIn;
      if (next !== null) {
        edge = next;
        continue;
      }
    }

    while (top > base) {
      const parent = /**@__INLINE__*/ readRecomputeStack(--top);
      /**@__INLINE__*/ setRecomputeStackHigh(top);

      if (changed) {
        changed = refresh(node);
      } else {
        node.state &= ~Invalid;
      }

      node = parent.to;

      if (!changed) {
        const next = parent.nextIn;
        if (next !== null) {
          edge = next;
          continue scan;
        }
      }
    }

    if (!changed) {
      node.state &= ~Invalid;
    }

    /**@__INLINE__*/ releaseRecomputeStackBase(base);
    return changed;
  } while (true);
}
