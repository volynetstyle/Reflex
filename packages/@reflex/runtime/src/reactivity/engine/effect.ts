import {
  ReactiveNode,
  ReactiveNodeState,
  clearDirtyState,
  getNodeContext,
  isDisposedState,
} from "../shape";
import { unlinkAllSources } from "../shape/methods/connect";
import { executeNodeComputation } from "./execute";

export function runEffect(node: ReactiveNode): void {
  const compute = node.compute;
  if (!compute || isDisposedState(node.state)) return;

  const prevCleanup = node.payload as (() => void) | null;
  node.payload = null;
  prevCleanup?.();

  executeNodeComputation(node, (result) => {
    node.v = getNodeContext(node).getEpoch();
    clearDirtyState(node);

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
