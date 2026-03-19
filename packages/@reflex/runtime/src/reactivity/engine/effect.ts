import {
  PENDING_STATE,
  PROPAGATION_VISITED_STATE,
  ReactiveNode,
  ReactiveNodeState,
  clearDirtyState,
  getNodeContext,
  isChangedState,
  isDisposedState,
} from "../shape";
import { unlinkAllSources } from "../shape/methods/connect";
import { executeNodeComputation } from "./execute";
import { checkDirty } from "../walkers/checkDirty";

export function runEffect(node: ReactiveNode): void {
  const compute = node.compute;
  if (!compute || isDisposedState(node.state)) return;

  const shouldRun = node.v === 0
    || isChangedState(node.state)
    || (node.state & PENDING_STATE) !== 0 && checkDirty(node);

  if (!shouldRun) {
    clearDirtyState(node);
    return;
  }

  const prevCleanup = node.payload as (() => void) | null;
  node.payload = null;
  prevCleanup?.();

  executeNodeComputation(node, (result) => {
    node.v = getNodeContext(node).getEpoch();
    clearDirtyState(node);
    node.state &= ~PROPAGATION_VISITED_STATE;

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
