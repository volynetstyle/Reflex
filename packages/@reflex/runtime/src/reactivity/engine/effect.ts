import {
  MAYBE_CHANGE_STATE,
  ReactiveNode,
  ReactiveNodeState,
  clearDirtyState,
  isChangedState,
  isDisposedState,
} from "../shape";
import { unlinkAllSources } from "../shape/methods/connect";
import { executeNodeComputation } from "./execute";
import { shouldRecompute } from "../walkers/shouldRecompute";

export function runEffect(node: ReactiveNode): void {
  const compute = node.compute;
  if (!compute || isDisposedState(node.state)) return;

  const shouldRun = isChangedState(node.state)
    || (node.state & MAYBE_CHANGE_STATE) !== 0 && shouldRecompute(node);

  if (!shouldRun) {
    clearDirtyState(node);
    return;
  }

  const prevCleanup = node.payload as (() => void) | null;
  node.payload = null;
  prevCleanup?.();

  executeNodeComputation(node, (result) => {
    clearDirtyState(node);
    node.state &= ~ReactiveNodeState.Visited;

    if (typeof result === "function") {
      node.payload = result as () => void;
    }
  });
}

export function disposeEffect(node: ReactiveNode): void {
  if (isDisposedState(node.state)) return;

  node.state |= ReactiveNodeState.Disposed;

  const cleanup = node.payload as (() => void) | null;
  node.payload = null;
  cleanup?.();

  unlinkAllSources(node);
}

export function recycling(node: ReactiveNode): void {
  runEffect(node);
}
