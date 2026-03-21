import {
  DIRTY_STATE,
  ReactiveNode,
  ReactiveNodeState,
  clearDirtyState,
} from "../shape";
import { unlinkAllSources } from "../shape/methods/connect";
import { executeNodeComputation } from "./execute";
import { shouldRecompute } from "../walkers/shouldRecompute";

export function runEffect(node: ReactiveNode): void {
  const state = node.state;

  if (!node.compute || (state & ReactiveNodeState.Disposed) !== 0) return;
  if ((state & DIRTY_STATE) === 0 || !shouldRecompute(node)) {
    clearDirtyState(node);
    return;
  }

  const prevCleanup = node.payload as (() => void) | null;
  node.payload = null;
  prevCleanup?.();

  executeNodeComputation(node, (result) => {
    node.state &= ~(ReactiveNodeState.Visited | DIRTY_STATE);
    if (typeof result === "function") node.payload = result as () => void;
  });
}

export function disposeEffect(node: ReactiveNode): void {
  if ((node.state & ReactiveNodeState.Disposed) !== 0) return;

  node.state |= ReactiveNodeState.Disposed;
  (node.payload as (() => void) | null)?.();
  node.payload = null;
  unlinkAllSources(node);
}

export const recycling = runEffect;