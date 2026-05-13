import type { ReactiveEdge, ReactiveNode } from "../shape";
import { Changed, Invalid } from "../shape";
import { devAssertIncomingEdge } from "../dev";
import { refresh } from "./ensureFresh";
import { BAIL, CLEAN, DIRTY } from "./walkerConstants";
import {
  clearInvalid,
  getRecomputeStackBase,
  pushRecomputeStack,
  readRecomputeStack,
  releaseRecomputeStackBase,
  resetRecomputeStackBase,
  setRecomputeStackHigh,
} from "./walkerStack";

/**
 * Fast-path walker for a linear dependency chain.
 *
 * It follows `edge.from` while every visited node has at most one dependency.
 * If branching is detected, returns `BAIL` so the caller can fallback to the
 * full DFS walker.
 */
export function walkLine(node: ReactiveNode, edge: ReactiveEdge): number {
  if (__DEV__) devAssertIncomingEdge(node, edge);

  const base = getRecomputeStackBase();
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
      setRecomputeStackHigh(top);
      dirty = refresh(dep);
      break;
    }

    if ((state & Invalid) !== 0) {
      const deps = dep.firstIn;

      if (deps !== null) {
        if (deps.nextIn !== null) {
          resetRecomputeStackBase(base);
          return BAIL;
        }

        top = pushRecomputeStack(edge, top);

        edge = deps;
        node = dep;
        continue;
      }

      setRecomputeStackHigh(top);
      dirty = refresh(dep);
      break;
    }

    if (edge.nextIn !== null) {
      resetRecomputeStackBase(base);
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
    const parent = readRecomputeStack(--top);
    setRecomputeStackHigh(top);

    dirty = refresh(node);
    node = parent.to;

    if (!dirty) {
      clearInvalid(node, top, base);
      return CLEAN;
    }
  }

  releaseRecomputeStackBase(base);
  return DIRTY;
}
