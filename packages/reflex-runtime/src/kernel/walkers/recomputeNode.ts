import type { ReactiveNode } from "../shape";
import { Changed, Invalid, Visited } from "../shape";
import { walkBranch } from "./recomputeBranch";

// 
function shouldRecompute(node: ReactiveNode, state: number = node.state): boolean {
  // Already known dirty.
  if ((state & Changed) !== 0) return true;

  // If node is not invalid, dependencies do not need inspection.
  //
  // This relies on the core invariant:
  // if a dependency may affect this node, propagation marks this node Invalid/Changed.
  if ((state & Invalid) === 0) {
    const edge = node.firstIn;

    if (edge === null) return false;

    return walkBranch(node, edge);
  }

  // Visited invalid consumer must recompute.
  if ((state & Visited) !== 0) return true;

  const edge = node.firstIn;

  // Invalid leaf with no dependencies: nothing to pull.
  if (edge === null) {
    node.state = state & ~Invalid;
    return false;
  }

  return walkBranch(node, edge);
}

const FORCE_RECOMPUTE_STATE = Changed | Visited;

function shouldRecomputeDirty(node: ReactiveNode, state: number): boolean {
  if ((state & FORCE_RECOMPUTE_STATE) !== 0) return true;

  const edge = node.firstIn;
  return edge !== null && walkBranch(node, edge);
}

export {
  shouldRecompute,
  shouldRecomputeDirty as shouldRecomputeDirtyConsumer,
  shouldRecomputeDirty as shouldRecomputeDirtyWatcher,
};
