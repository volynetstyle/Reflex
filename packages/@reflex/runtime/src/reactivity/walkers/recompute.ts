import { devAssertShouldRecomputeAlive } from "../dev";
import type { ReactiveNode } from "../shape";
import { ReactiveNodeState } from "../shape";
import { shouldRecomputeLinear } from "./recompute.branch";

const STOP_RECOMPUTE = ReactiveNodeState.Producer | ReactiveNodeState.Disposed;
const REENTRANT_STALE = ReactiveNodeState.Invalid | ReactiveNodeState.Reentrant;
const WATCHER_REENTRANT_STALE =
  ReactiveNodeState.Invalid | ReactiveNodeState.Reentrant;

export function shouldRecomputeDirtyConsumer(
  node: ReactiveNode,
  state: number,
): boolean {
  if ((state & ReactiveNodeState.Changed) !== 0) {
    return true;
  }

  if ((state & REENTRANT_STALE) === REENTRANT_STALE) {
    return true;
  }

  const firstIn = node.firstIn;
  if (firstIn === null) {
    node.state = state & ~ReactiveNodeState.Invalid;
    return false;
  }

  return shouldRecomputeLinear(node, firstIn);
}

export function shouldRecomputeDirtyWatcher(
  node: ReactiveNode,
  state: number,
): boolean {
  if ((state & ReactiveNodeState.Changed) !== 0) {
    return true;
  }

  if ((state & WATCHER_REENTRANT_STALE) === WATCHER_REENTRANT_STALE) {
    return true;
  }

  const firstIn = node.firstIn;
  if (firstIn === null) {
    node.state = state & ~ReactiveNodeState.Invalid;
    return false;
  }

  return shouldRecomputeLinear(node, firstIn);
}

// Entry point. Kept small so TurboFan/Ion/DFG eagerly inline it into callers.
// All early-exit checks come first so the common fast paths never touch
// getDefaultContext() or the stack.
export function shouldRecompute(node: ReactiveNode): boolean {
  const state = node.state;

  // Producers commit on write — pull walk is never needed.
  // Disposed: no-op (dev assertion handles the message).
  if ((state & STOP_RECOMPUTE) !== 0) {
    if (__DEV__) devAssertShouldRecomputeAlive();
    return false;
  }

  // Push-side propagate already confirmed a change.
  // Or this node was invalidated while mid-compute and must rerun.
  if (
    (state & ReactiveNodeState.Changed) !== 0 ||
    (state & REENTRANT_STALE) === REENTRANT_STALE
  ) {
    return true;
  }

  const firstIn = node.firstIn;
  if (firstIn === null) {
    node.state = state & ~ReactiveNodeState.Invalid;
    return false;
  }

  return shouldRecomputeLinear(node, firstIn);
}
