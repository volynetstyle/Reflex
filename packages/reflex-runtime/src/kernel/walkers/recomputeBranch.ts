import type { ReactiveEdge, ReactiveNode } from "../shape";
import { Changed, Invalid } from "../shape";
import { devAssertRefreshEdge } from "../dev";
import { advance } from "./ensureFresh";
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
  const base = getRecomputeStackBase();
  let top = base;
  let changed = false;

  scan: do {
    const dep = edge.from;
    const state = dep.state;

    if ((node.state & Changed) !== 0) {
      changed = true;
    } else if ((state & Changed) !== 0) {
      setRecomputeStackHigh(top);
      if (__DEV__) devAssertRefreshEdge(dep, edge);
      changed = advance(dep);
    } else if ((state & Invalid) !== 0) {
      // hidden classes risk deopt
      const deps = dep.firstIn;

      if (deps !== null) {
        top = pushRecomputeStack(edge, top);
        edge = deps;
        node = dep;
        continue;
      }

      setRecomputeStackHigh(top);
      if (__DEV__) devAssertRefreshEdge(dep, edge);
      changed = advance(dep);
    }

    if (!changed) {
      const next = edge.nextIn;
      if (next !== null) {
        edge = next;
        continue;
      }
    }

    while (top > base) {
      --top;
      setRecomputeStackHigh(top);
      const parent = readRecomputeStack(top);

      if (changed) {
        changed = advance(node);
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

    releaseRecomputeStackBase(base);
    return changed;
  } while (true);
}
