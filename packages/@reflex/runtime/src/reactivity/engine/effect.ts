import {
  DIRTY_STATE,
  MAYBE_CHANGE_STATE,
  ReactiveNode,
  ReactiveNodeState,
  clearDirtyState,
} from "../shape";
import { unlinkAllSources } from "../shape/methods/connect";
import { executeNodeComputation } from "./execute";
import { shouldRecompute } from "../walkers/shouldRecompute";

export function runEffect(node: ReactiveNode): void {
  const state = node.state;

  const compute = node.compute;
  if (!compute || (state & ReactiveNodeState.Disposed) !== 0) return;

  const shouldRun = (state & DIRTY_STATE) !== 0 && shouldRecompute(node);

  if (!shouldRun) {
    clearDirtyState(node);
    return;
  }

  const prevCleanup = node.payload as (() => void) | null;
  node.payload = null;
  prevCleanup?.();

  const commit = (result: unknown) => {
    clearDirtyState(node);
    node.state &= ~(ReactiveNodeState.Visited | DIRTY_STATE);

    if (typeof result === "function") {
      node.payload = result as () => void;
    }
  };

  executeNodeComputation(node, commit);
}

export function disposeEffect(node: ReactiveNode): void {
  if ((node.state & ReactiveNodeState.Disposed) !== 0) return;

  node.state |= ReactiveNodeState.Disposed;

  const cleanup = node.payload as (() => void) | null;
  node.payload = null;
  cleanup?.();

  unlinkAllSources(node);
}

export function recycling(node: ReactiveNode): void {
  runEffect(node);
}
