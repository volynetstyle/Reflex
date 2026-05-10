import type { ReactiveNode } from "../shape";
import { Changed, Invalid, Reentrant } from "../shape";
import { BAIL, DIRTY, walkBranch, walkLine } from "./recompute.branch";

const CLEAN_DEMAND = Changed | Invalid | Reentrant;

function isChanged(node: ReactiveNode, state: number = 0): boolean {
  // // Already known dirty.
  // if ((state & Changed) !== 0) return true;

  // Reentrant invalid consumer must recompute.
  if ((state & CLEAN_DEMAND) === CLEAN_DEMAND) return true;

  // If node is not invalid, dependencies do not need inspection.
  //
  // This relies on the core invariant:
  // if a dependency may affect this node, propagation marks this node Invalid/Changed.
  if ((state & Invalid) === 0) return false;

  const edge = node.firstIn;

  // Invalid leaf with no dependencies: nothing to pull.
  if (edge === null) {
    node.state = state & ~Invalid;
    return false;
  }

  // Fast path only when current node has exactly one dependency.
  if (edge.nextIn === null) {
    const result = walkLine(node, edge);
    if (result !== BAIL) return result === DIRTY;
  }

  return walkBranch(node, edge);
}

export {
  isChanged as shouldRecompute,
  isChanged as shouldRecomputeDirtyConsumer,
  isChanged as shouldRecomputeDirtyWatcher,
};
