import {
  DIRTY_STATE,
  ReactiveNode,
  ReactiveNodeState,
  UNINITIALIZED,
  clearDirtyState,
} from "../reactivity/shape";
import { unlinkAllSources } from "../reactivity/shape/methods/connect";
import { executeNodeComputation } from "../reactivity/engine/execute";
import { shouldRecompute } from "../reactivity/walkers/shouldRecompute";

export function runWatcher(node: ReactiveNode): void {
  const state = node.state;

  if ((state & ReactiveNodeState.Disposed) !== 0) return;
  if ((state & DIRTY_STATE) === 0 || !shouldRecompute(node)) {
    clearDirtyState(node);
    return;
  }

  const prevCleanup = node.payload as (() => void) | null;
  node.payload = UNINITIALIZED;
  prevCleanup?.();

  executeNodeComputation(node, (result) => {
    node.state &= ~(ReactiveNodeState.Visited | DIRTY_STATE);
    if (typeof result === "function") node.payload = result as () => void;
  });
}

export function disposeWatcher(node: ReactiveNode): void {
  if ((node.state & ReactiveNodeState.Disposed) !== 0) return;

  node.state |= ReactiveNodeState.Disposed;
  (node.payload as (() => void) | null)?.();
  node.payload = UNINITIALIZED;
  unlinkAllSources(node);
}

export const recycling = runWatcher;
