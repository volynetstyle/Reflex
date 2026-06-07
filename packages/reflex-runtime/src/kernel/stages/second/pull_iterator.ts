import {
  noteShouldRecomputeStackUsage,
  readRuntimeWalkerStackStats,
} from "../stackStats";
import { devAssertRefreshEdge } from "../../dev";
import type { ReactiveEdge, ReactiveNode } from "../../shape";
import { Changed, Invalid } from "../../shape";
import { advance } from "./advance";

const stack: ReactiveEdge[] = [];
let high = 0;

/**
 * Pull dependency walker for dirty incoming dependency links.
 *
 * Semantics:
 * - scans incoming dependency edges;
 * - descends into Invalid dependencies with their own inputs;
 * - refreshes Changed / Invalid leaves through advance();
 * - bubbles confirmed changes upward;
 * - resumes siblings only while the current branch remains stable.
 */
export function pull_iterator(node: ReactiveNode, edge: ReactiveEdge): boolean {
  const base = high;
  let top = base;
  let changed = false;

  scan: while (true) {
    /**
     * If the current node is already Changed, the current dependency edge
     * does not need to be inspected. We are going to bubble anyway.
     */
    if ((node.state & Changed) !== 0) {
      changed = true;
    } else {
      const dep = edge.from;
      const depState = dep.state;

      if ((depState & Changed) !== 0) {
        /**
         * advance() may re-enter pull walking, so expose only the active
         * stack slice before calling it.
         */
        high = top;

        if (__DEV__) {
          devAssertRefreshEdge(dep, edge);
        }

        changed = advance(dep);
      } else if ((depState & Invalid) !== 0) {
        const firstIn = dep.firstIn;

        if (firstIn !== null) {
          stack[top] = edge;
          top = top + 1;

          if (__DEV__) {
            noteShouldRecomputeStackUsage(top);
          }

          node = dep;
          edge = firstIn;
          continue scan;
        }

        high = top;

        if (__DEV__) {
          devAssertRefreshEdge(dep, edge);
        }

        changed = advance(dep);
      } else {
        changed = false;
      }
    }

    /**
     * Stable branch: try the next dependency of the same parent before
     * bubbling upward.
     */
    if (!changed) {
      const sibling = edge.nextIn;

      if (sibling !== null) {
        edge = sibling;
        continue scan;
      }
    }

    if (changed) {
      while (top !== base) {
        top = top - 1;
        high = top;

        const parentEdge = stack[top]!;
        changed = advance(node);
        node = parentEdge.to;

        if (!changed) {
          const sibling = parentEdge.nextIn;

          if (sibling !== null) {
            edge = sibling;
            continue scan;
          }

          break;
        }
      }

      if (changed) {
        high = base;
        return true;
      }
    }

    /**
     * Stable bubble phase.
     *
     * Pop parent continuations until:
     * - a stable parent has another sibling to scan;
     * - or the root of this pull walk is reached.
     */
    while (top !== base) {
      top = top - 1;
      high = top;

      const parentEdge = stack[top]!;
      node.state &= ~Invalid;
      node = parentEdge.to;

      const sibling = parentEdge.nextIn;

      if (sibling !== null) {
        edge = sibling;
        continue scan;
      }
    }

    if (!changed) {
      node.state &= ~Invalid;
    }

    high = base;
    return changed;
  }
}

export function readShouldRecomputeStackStats(): {
  shouldRecompute: { current: number; peak: number; capacity: number };
  propagate: { current: number; peak: number; capacity: number };
} {
  return readRuntimeWalkerStackStats(high, stack.length, 0, 0);
}
