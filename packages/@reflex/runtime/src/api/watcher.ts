import {
  DIRTY_STATE,
  ReactiveNode,
  ReactiveNodeState,
  UNINITIALIZED,
  clearDirtyState,
} from "../reactivity/shape";
import {
  disposeNode,
} from "../reactivity/shape/methods/connect";
import { executeNodeComputation } from "../reactivity/engine/execute";
import { shouldRecompute } from "../reactivity/walkers/shouldRecompute";

export function runWatcher(node: ReactiveNode): void {
  const state = node.state;

  if ((state & ReactiveNodeState.Disposed) !== 0) return;
  if ((state & DIRTY_STATE) === 0 || !shouldRecompute(node)) {
    clearDirtyState(node);
    return;
  }

  const prevCleanup =
    typeof node.payload === "function" ? (node.payload as () => void) : null;
  node.payload = UNINITIALIZED;
  node.state &= ~(ReactiveNodeState.Visited | DIRTY_STATE);
  prevCleanup?.();

  executeNodeComputation(node, (result) => {
    node.state &= ~ReactiveNodeState.Visited;
    if (typeof result === "function") node.payload = result as () => void;
  });
}

export function disposeWatcher(node: ReactiveNode): void {
  disposeNode(node);

  const cleanup =
    typeof node.payload === "function" ? (node.payload as () => void) : null;
  cleanup?.();
  node.payload = UNINITIALIZED;
}

export const recycling = runWatcher;
