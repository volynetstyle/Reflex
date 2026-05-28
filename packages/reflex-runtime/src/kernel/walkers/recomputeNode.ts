import type { ReactiveNode } from "../shape";
import { Changed, Invalid, Reentrant } from "../shape";
import { walkBranch } from "./recomputeBranch";

// @__INLINE__
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

  // Reentrant invalid consumer must recompute.
  if ((state & Reentrant) !== 0) return true;

  const edge = node.firstIn;

  // Invalid leaf with no dependencies: nothing to pull.
  if (edge === null) {
    node.state = state & ~Invalid;
    return false;
  }

  return walkBranch(node, edge);
}

// @__INLINE__
function shouldRecomputeDirty(node: ReactiveNode, state: number): boolean {
  if ((state & Changed) !== 0) return true;

  // Reentrant invalid consumer must recompute.
  if ((state & Reentrant) !== 0) return true;

  const edge = node.firstIn;

  // Invalid leaf with no dependencies: nothing to pull.
  if (edge === null) {
    node.state = state & ~Invalid;
    return false;
  }

  return walkBranch(node, edge);
}

export {
  shouldRecompute,
  shouldRecomputeDirty as shouldRecomputeDirtyConsumer,
  shouldRecomputeDirty as shouldRecomputeDirtyWatcher,
};
